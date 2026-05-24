import { createHonoAuthMiddleware } from "@repo/auth";
import { apiConfig } from "@repo/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { db } from "./db.js";
import type { PmsEnv } from "./types.js";
import { startPmsServer } from "./server.js";
import { propertiesRouter } from "./routes/properties.js";
import { roomsRouter } from "./routes/rooms.js";
import { bookingsRouter } from "./routes/bookings.js";
import { guestsRouter } from "./routes/guests.js";
import { paymentsRouter } from "./routes/payments.js";
import { channelsRouter } from "./routes/channels.js";
import { cleaningRouter } from "./routes/cleaning.js";
import { staffRouter } from "./routes/staff.js";
import { reportsRouter } from "./routes/reports.js";
import { calendarRouter } from "./routes/calendar.js";
import { messageTemplatesRouter } from "./routes/message-templates.js";
import { dateOverridesRouter } from "./routes/date-overrides.js";

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<PmsEnv>();

// CORS
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));

// Health
app.get("/health", (c) => c.json({ status: "ok", service: "pms", timestamp: new Date().toISOString() }));

// ─── Public iCal feed (no auth) ───────────────────────────────────────────────

app.get("/api/ical/:token", async (c) => {
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  const { buildIcalFeed } = await import("./ical/sync.js");
  const feed = await buildIcalFeed(db, c.req.param("token"));
  if (!feed) return c.json({ error: "not_found" }, 404);
  return c.text(feed, 200, { "Content-Type": "text/calendar; charset=utf-8" });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

const productAuth = createHonoAuthMiddleware(apiConfig.authTokenSecret, "pms");

app.use("/api/*", async (c, next) => {
  // Allow internal platform-to-service calls (worker, control plane API)
  const internalSecret = process.env.PLATFORM_API_SECRET?.trim();
  const incoming = c.req.header("x-stockix-internal-secret")?.trim();
  const tenantHeader = c.req.header("x-stockix-tenant-id")?.trim();
  if (
    internalSecret &&
    incoming &&
    incoming === internalSecret &&
    tenantHeader &&
    z.string().uuid().safeParse(tenantHeader).success
  ) {
    c.set("stockix", {
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: tenantHeader,
      modules: ["pms"],
      roles: ["admin"],
      planSlug: "operator",
    });
    return next();
  }
  return productAuth(c, next);
});

// ─── Mount route modules ──────────────────────────────────────────────────────

app.route("/api/properties", propertiesRouter);
app.route("/api/rooms", roomsRouter);
app.route("/api/bookings", bookingsRouter);
app.route("/api/guests", guestsRouter);
app.route("/api/payments", paymentsRouter);
app.route("/api/channels", channelsRouter);
app.route("/api/cleaning", cleaningRouter);
app.route("/api/staff", staffRouter);
app.route("/api/reports", reportsRouter);
app.route("/api/calendar", calendarRouter);
app.route("/api/message-templates", messageTemplatesRouter);
app.route("/api/date-overrides", dateOverridesRouter);

// ─── Start ────────────────────────────────────────────────────────────────────

startPmsServer(app, db);
