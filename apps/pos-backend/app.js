require('./env-validate-boot'); // Boot validation — must be first
const http = require("http");
const express = require("express");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const { Server } = require("socket.io");
const connectDB = require("./config/database");
const config = require("./config/config");
const globalErrorHandler = require("./middlewares/globalErrorHandler");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { requestCorrelation } = require("./middlewares/requestCorrelation");
const { extractSubdomainOrg } = require("./middlewares/extractSubdomainOrg");
const { initSentry } = require("./services/observability");
const { OrgAccessCache } = require("./services/orgAccessCache");
const logger = require("./lib/logger");
const app = express();
const processErrorHandlersFlag = "__POS_PROCESS_ERROR_HANDLERS__";


const PORT = config.port;



initSentry();
connectDB();
OrgAccessCache.startOrgAccessCacheReconciliationJob();

if (!global[processErrorHandlersFlag]) {
  global[processErrorHandlersFlag] = true;
  process.on("unhandledRejection", (reason) => {
    logger.error("[process] unhandledRejection:", reason);
  });
  process.on("uncaughtException", (error) => {
    logger.error("[process] uncaughtException:", error);
  });
}

// Register Mongoose models (populate / refs)
require("./models/printerModel");
require("./models/categoryModel");
require("./models/menuItemModel");
require("./models/modifierGroupModel");
require("./models/comboModel");
require("./models/splitBillModel");
require("./models/orderModel");
require("./models/ingredientModel");
require("./models/recipeModel");
require("./models/purchaseOrderModel");
require("./models/stockMovementModel");
require("./models/locationModel");
require("./models/customerModel");
require("./models/loyaltyAccountModel");
require("./models/loyaltyConfigModel");
require("./models/taxConfigModel");
require("./models/rbacConfigModel");
require("./models/accountingAccountModel");
require("./models/journalEntryModel");
require("./models/accountingConfigModel");
require("./models/integrationConfigModel");
require("./models/integrationItemMappingModel");
require("./models/accountingSessionModel");
require("./models/accountingSequenceModel");
require("./models/journalAuditLogModel");
require("./models/fxRateModel");
require("./models/inventoryCostLayerModel");
require("./models/supplierModel");
require("./models/ingredientCategoryModel");
require("./models/ingredientSupplierModel");
require("./models/stockBalanceModel");
require("./models/orderStockReservationModel");
require("./models/stockLotModel");
require("./models/stockTakeSessionModel");
require("./models/ingredientPriceHistoryModel");
require("./models/printJobModel");
require("./models/publicMenuBrandingModel");
require("./models/tableModel");
require("./models/qrScanEventModel");
require("./models/accountingInvoiceModel");
require("./models/accountingPeriodModel");
require("./models/accountingSyncLogModel");
require("./models/threeWayMatchModel");
require("./models/vendorBillModel");
require("./models/vendorReturnModel");
require("./models/expenseReportModel");
require("./models/approvalRequestModel");
require("./models/serialNumberModel");
require("./models/backofficeNotificationModel");
require("./models/reportScheduleModel");

require("./models/organizationModel");
require("./models/platformUserModel");
require("./models/platformApiKeyModel");
require("./models/platformAuditLogModel");
require("./models/webhookEndpointModel");
require("./models/webhookOutboxModel");
require("./models/productEventModel");
require("./models/tenantApiRequestMetricModel");
require("./models/deviceModel");
require("./models/featureFlagModel");
require("./models/orgInvitationModel");
require("./models/schemaMigrationModel");
require("./models/fraudReviewCaseModel");
require("./models/idempotencyRecordModel");

// Middlewares — credentialed requests need explicit origins (Vite may use 5173, 5174, …)
app.use(requestCorrelation);

// Production HTTPS enforcement check (exempting health/ready routes for internal monitoring)
if (config.nodeEnv === "production") {
  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/ready") return next();
    
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    if (!isHttps) {
      logger.warn("Production requires HTTPS for secure cookie support. Rejecting HTTP request.");
      return res.status(400).json({
        success: false,
        message: "Production requires HTTPS for secure cookie support.",
      });
    }
    next();
  });
}
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      if (config.isWildcardPosOrigin(origin)) return callback(null, true);
      if (
        Array.isArray(config.platformCorsOrigins) &&
        config.platformCorsOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id",
      "X-Location-Id",
      "X-Visitor-Key",
      "X-Session-Id",
      "traceparent",
      "tracestate",
      "X-Api-Key",
      "X-Refresh-Token",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-Request-Id", "traceparent"],
  })
);
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}
app.use(
  express.json({
    verify: (req, _res, buf) => {
      const url = req.originalUrl || req.url || "";
      if (url.endsWith("/webhook-verification")) {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
); // parse incoming request in json format
app.use(cookieParser());
app.use(extractSubdomainOrg);

function parseOriginFromReferer(refererValue) {
  if (!refererValue) return "";
  try {
    return new URL(String(refererValue)).origin;
  } catch {
    return "";
  }
}

function isCookieAuthenticatedMutation(req) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return false;
  if (req.headers.authorization || req.headers["x-api-key"]) return false;
  return Boolean(
    req.cookies?.accessToken ||
      req.cookies?.refreshToken ||
    req.cookies?.platformAccessToken || req.cookies?.platformRefreshToken
  );
}

app.use((req, res, next) => {
  if (!isCookieAuthenticatedMutation(req)) return next();
  const isPlatformRoute = req.path.startsWith("/api/platform/v1/");
  const allowedOrigins = new Set(
    isPlatformRoute
      ? config.platformCorsOrigins || []
      : [...(config.corsOrigins || []), ...(config.platformCorsOrigins || [])]
  );
  const origin = String(req.headers.origin || "").trim();
  const refererOrigin = parseOriginFromReferer(req.headers.referer);
  const candidateOrigin = origin || refererOrigin;
  const wildcardPosAllowed =
    !isPlatformRoute &&
    candidateOrigin &&
    typeof config.isWildcardPosOrigin === "function" &&
    config.isWildcardPosOrigin(candidateOrigin);
  if (
    !candidateOrigin ||
    (!allowedOrigins.has(candidateOrigin) && !wildcardPosAllowed)
  ) {
    return res.status(403).json({
      success: false,
      message: "Invalid request origin.",
    });
  }
  next();
});

try {
  // Optional API documentation (OpenAPI 3.1 YAML → Swagger UI).
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const swaggerUi = require("swagger-ui-express");
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const yaml = require("yaml");
  const uiOpts = {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "POS API Docs",
  };
  const mountSpec = (mountPath, fileName) => {
    const openapiPath = path.join(__dirname, "openapi", fileName);
    if (!fs.existsSync(openapiPath)) return;
    const openapiDoc = yaml.parse(fs.readFileSync(openapiPath, "utf8"));
    app.use(
      mountPath,
      ...swaggerUi.serveFiles(openapiDoc),
      swaggerUi.setup(openapiDoc, uiOpts)
    );
  };
  mountSpec("/api-docs/platform", "platform-v1.yaml");
  mountSpec("/api-docs/pos", "tenant-pos-v1.yaml");
} catch {
  /* optional deps missing in minimal installs */
}

app.get("/api-docs", (_req, res) => {
  const port = config.port;
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>POS API documentation</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; line-height: 1.5; }
    h1 { font-size: 1.25rem; }
    ul { padding-left: 1.2rem; }
    a { color: #0969da; }
    p.muted { color: #656d76; font-size: 0.875rem; }
  </style>
</head>
<body>
  <h1>Restaurant POS — API docs (Swagger UI)</h1>
  <p>Open these on the same host that runs the backend (port <strong>${port}</strong> unless <code>PORT</code> is set in <code>.env</code>).</p>
  <ul>
    <li><a href="/api-docs/pos">Tenant / store API</a> — orders, RBAC, inventory, accounting, …</li>
    <li><a href="/api-docs/platform">Platform API</a> — organizations, billing, jobs, flags, …</li>
  </ul>
  <p class="muted">Examples: <code>http://localhost:${port}/api-docs</code> · <code>http://localhost:${port}/api-docs/pos</code></p>
</body>
</html>`);
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    fallthrough: true,
    maxAge: "7d",
  })
);

// Root Endpoint
app.get("/", (req,res) => {
    res.json({message : "Hello from POS Server!"});
})

app.use(require("./routes/healthRoute"));

// Other Endpoints
const authRoute = require("./routes/authRoute");
const userRoute = require("./routes/userRoute");
const orderRoute = require("./routes/orderRoute");
const tableRoute = require("./routes/tableRoute");
const stockTakeRoute = require("./routes/stockTakeRoute");

function mountLegacyAlias(aliasPath, canonicalPath, router) {
  app.use(aliasPath, (req, res, next) => {
    res.setHeader("X-Deprecated-Route", `Use ${canonicalPath}`);
    next();
  }, router);
}

app.use("/api/public", require("./routes/publicRoute"));
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/users", require("./routes/staffRoute"));
app.use("/api/devices", require("./routes/deviceRoute"));
app.use("/api/orders", orderRoute);
mountLegacyAlias("/api/order", "/api/orders", orderRoute);
app.use("/api/tables", tableRoute);
mountLegacyAlias("/api/table", "/api/tables", tableRoute);
app.use("/api/payment", require("./routes/paymentRoute"));
app.use("/api/categories", require("./routes/categoryRoute"));
app.use("/api/menu-items", require("./routes/menuItemRoute"));
app.use("/api/modifier-groups", require("./routes/modifierGroupRoute"));
app.use("/api/combos", require("./routes/comboRoute"));
app.use("/api/split-bills", require("./routes/splitBillRoute"));
app.use("/api/upload", require("./routes/uploadRoute"));
app.use("/api/printers", require("./routes/printerRoute"));
app.use("/api/ingredients", require("./routes/ingredientRoute"));
app.use("/api/ingredient-categories", require("./routes/ingredientCategoryRoute"));
app.use("/api/suppliers", require("./routes/supplierRoute"));
app.use("/api/recipes", require("./routes/recipeRoute"));
app.use("/api/inventory", require("./routes/inventoryRoute"));
// Stock take: prefer `/api/stock-takes` for new clients. `/api/inventory/stock-take` is the same router (legacy path).
mountLegacyAlias(
  "/api/inventory/stock-take",
  "/api/stock-takes",
  stockTakeRoute
);
app.use("/api/purchase-orders", require("./routes/purchaseOrderRoute"));
app.use("/api/goods-receipt-notes", require("./routes/goodsReceiptNoteRoute"));
app.use("/api/vendor-returns", require("./routes/vendorReturnRoute"));
app.use("/api/request-for-quotations", require("./routes/rfqRoute"));
app.use("/api/warehouse", require("./routes/warehouseRoute"));
// Canonical mount for stock take sessions (`pos-frontend2` uses this path).
app.use("/api/stock-takes", stockTakeRoute);
app.use("/api/reports", require("./routes/reportRoute"));
app.use("/api/report-schedules", require("./routes/reportScheduleRoute"));
app.use("/api/dashboard", require("./routes/dashboardRoute"));
app.use("/api/locations", require("./routes/locationRoute"));
app.use("/api/customers", require("./routes/customerRoute"));
app.use("/api/loyalty", require("./routes/loyaltyRoute"));
app.use("/api/config", require("./routes/configRoute"));
app.use("/api/rbac", require("./routes/rbacRoute"));
app.use("/api/accounting", require("./routes/accountingRoute"));
app.use("/api/integrations", require("./routes/integrationRoute"));
app.use("/api/v1/setup", require("./routes/setupRoute"));
app.use("/api/platform/v1", require("./routes/platformV1Route"));
app.use("/api/tenant", require("./routes/tenantIsolationRoute"));
app.use("/api/print-jobs", require("./routes/printJobRoute"));
app.use("/api/reconciliation", require("./routes/threeWayMatchRoute"));
app.use("/api/serials", require("./routes/serialRoute"));

// Global Error Handler
app.use(globalErrorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
  /** Limit single-packet payload size (Phase D hardening). */
  maxHttpBufferSize: Number.parseInt(String(process.env.SOCKET_MAX_HTTP_BUFFER || "1000000"), 10) || 1_000_000,
});
app.set("io", io);
const {
  setBackofficeNotificationIo,
} = require("./services/backofficeNotificationRealtime");
const { setIo } = require("./services/posSocketBus");
const PrintJob = require("./models/printJobModel");
const Printer = require("./models/printerModel");
setIo(io);
setBackofficeNotificationIo(io);

io.on("connection", (socket) => {
  socket.on("printer:register", async ({ printerId } = {}) => {
    try {
      const organizationId = socket.data.organizationId;
      if (!organizationId || !printerId) return;
      const printer = await Printer.findOne({
        _id: String(printerId),
        organization: organizationId,
      })
        .select("_id location")
        .lean();
      if (!printer) return;
      if (
        socket.data.locationId &&
        printer.location &&
        String(printer.location) !== String(socket.data.locationId)
      ) {
        return;
      }
      const room = `printer:${String(printer._id)}`;
      socket.join(room);
      logger.info(`Terminal registered for printer ${printer._id}`);
    } catch (e) {
      logger.warn("[printer:register] failed:", e && e.message ? e.message : e);
    }
  });

  socket.on("print:ack", async ({ printJobId, status, error } = {}) => {
    try {
      if (!printJobId || !status) return;
      const organizationId = socket.data.organizationId;
      if (!organizationId) return;
      const job = await PrintJob.findOne({
        _id: printJobId,
        org: organizationId,
      });
      if (!job) return;
      const alreadyTerminal = job.status === "done" || job.status === "failed";
      if (alreadyTerminal && job.status === status) return;
      if (alreadyTerminal && job.status !== status) {
        logger.warn(
          `[print:ack] conflicting ack ignored job=${printJobId} current=${job.status} incoming=${status}`
        );
        return;
      }
      if (status === "done") {
        job.status = "done";
        job.lastError = "";
      } else if (status === "failed") {
        job.status = "failed";
        job.lastError = error ? String(error) : "Terminal reported print failure.";
      } else {
        return;
      }
      await job.save();
    } catch (e) {
      logger.warn("[print:ack] failed:", e && e.message ? e.message : e);
    }
  });
});

const { createPosSocketRedisAdapter } = require("./services/posSocketRedisAdapter");
const { attachPosSocketServer } = require("./services/posSocketServer");

/** Resolves after Socket.IO auth middleware (and optional Redis adapter) are attached. */
const socketIoReady = (async () => {
  try {
    const pack = await createPosSocketRedisAdapter();
    attachPosSocketServer(io, { redisAdapter: pack?.adapter });
  } catch (e) {
    logger.warn(
      "[socket] Redis adapter disabled:",
      e && e.message ? e.message : e
    );
    attachPosSocketServer(io, {});
  }
})();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error(
      `Port ${PORT} is already in use. Stop the other process or set PORT in .env.\n` +
        `  Example:  lsof -i :${PORT} -t | xargs kill\n` +
        `  Or:       fuser -k ${PORT}/tcp`
    );
  } else {
    logger.error(err);
  }
  process.exit(1);
});

async function startServer() {
  await socketIoReady;
  server.listen(PORT, () => {
    logger.info(`POS Server is listening on port ${PORT}`);
    try {
      const { startInventoryAlertScheduler } = require("./services/inventoryAlertService");
      startInventoryAlertScheduler();
      const { startRecurringJournalScheduler } = require("./services/recurringJournalScheduler");
      startRecurringJournalScheduler();
      const { startReportScheduleService } = require("./services/reportScheduleService");
      startReportScheduleService();
    } catch (e) {
      logger.error("Schedulers failed to start:", e.message);
    }
  });
}

if (require.main === module) {
  startServer().catch((e) => {
    logger.error(e);
    process.exit(1);
  });
}

module.exports = { app, server, startServer, socketIoReady };