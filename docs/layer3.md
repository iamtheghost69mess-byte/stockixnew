# Layer 3: Environment Variables Audit
## 1. Direct process.env Access

### Directory: apps/api/src/
```text
apps/api/src/cron/reconciliation.ts:23:  if (!process.env.DATABASE_URL) return;
apps/api/src/cron/reconciliation.ts:24:  const db = createDb(process.env.DATABASE_URL);
apps/api/src/routes/pos-credentials.ts:318:      process.env.AUTH_TOKEN_SECRET || "",
apps/api/src/app/create-control-plane-app.ts:87:  if (!process.env.CHATWOOT_BASE_URL?.trim()) {
apps/api/src/instrumentation.ts:6:  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
apps/api/src/instrumentation.ts:35:  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
apps/api/src/services/mfa/mfa.ts:17:  const hex = process.env.MFA_ENCRYPTION_KEY?.trim();
apps/api/src/scripts/encrypt-legacy-mfa-secrets.ts:11:  const hex = process.env.MFA_ENCRYPTION_KEY?.trim();
```
### Directory: apps/pos-backend/
```text
apps/pos-backend/utils/socketEmit.js:17:    Number.parseInt(String(process.env.POS_SOCKET_MAX_PAYLOAD_BYTES || "65536"), 10) ||
apps/pos-backend/utils/resolveAnchorOrganizationId.js:9:  const envId = process.env.DEFAULT_ORG_ID;
apps/pos-backend/workers/platformWorker.js:125:    const brandName = process.env.BRAND_NAME || "Stockix";
apps/pos-backend/workers/bigcapitalSyncWorker.js:34:const OUTBOX_DRAIN_MS = Number(process.env.ACCOUNTING_OUTBOX_DRAIN_MS || 45_000);
apps/pos-backend/workers/bigcapitalSyncWorker.js:35:const STUCK_CHECK_MS = Number(process.env.ACCOUNTING_STUCK_CHECK_MS || 15 * 60_000);
apps/pos-backend/lib/load-env-if-dev.js:5:  if (process.env.NODE_ENV === "production") return;
apps/pos-backend/lib/logger.js:6:const IS_DEV = (process.env.NODE_ENV || "development") === "development";
apps/pos-backend/app.js:30:if (config.nodeEnv === "production" && !process.env.PLATFORM_JWT_SECRET) {
apps/pos-backend/app.js:378:  maxHttpBufferSize: Number.parseInt(String(process.env.SOCKET_MAX_HTTP_BUFFER || "1000000"), 10) || 1_000_000,
apps/pos-backend/tests/isolation.test.js:9:  if (process.env.RUN_ISOLATION === "1") {
apps/pos-backend/tests/isolation.test.js:15:  if (process.env.RUN_ISOLATION !== "1") return;
apps/pos-backend/tests/isolation.test.js:27:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:32:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:33:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:35:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:36:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:38:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:39:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:125:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:130:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:131:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:133:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:134:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:136:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:137:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:178:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:183:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:184:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:186:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:187:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:189:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:190:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:270:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:275:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:276:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:278:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:279:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:281:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:282:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:420:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:425:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:426:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:428:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:429:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:431:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:432:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:495:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:500:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:501:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:539:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:544:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:545:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:547:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:548:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:550:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:551:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:687:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:692:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:693:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:695:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:696:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:698:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:699:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:781:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:786:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:787:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:789:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:790:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:792:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:793:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:884:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:889:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:890:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:892:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:893:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:895:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:896:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:1021:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:1026:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1027:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1029:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1030:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1032:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:1033:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:1109:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:1114:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1115:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1117:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1118:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1120:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:1121:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:1221:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:1226:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1227:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1229:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1230:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1232:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:1233:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/isolation.test.js:1345:  if (process.env.RUN_ISOLATION !== "1") {
apps/pos-backend/tests/isolation.test.js:1350:  process.env.JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1351:    process.env.JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1353:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/tests/isolation.test.js:1354:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/tests/isolation.test.js:1356:  process.env.MONGODB_URI =
apps/pos-backend/tests/isolation.test.js:1357:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-isolation-test";
apps/pos-backend/tests/register-process-teardown.cjs:7:if (process.env.NODE_ENV === "test" || process.env.CI === "true") {
apps/pos-backend/tests/register-process-teardown.cjs:8:  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") {
apps/pos-backend/tests/register-process-teardown.cjs:9:    process.env.REDIS_URL = "";
apps/pos-backend/tests/register-process-teardown.cjs:11:  if (process.env.RUN_POS_INTEGRATION_MONGO !== "1") {
apps/pos-backend/tests/register-process-teardown.cjs:12:    delete process.env.MONGODB_URI;
apps/pos-backend/tests/unit/pin-lookup.test.js:7:  const originalSecret = process.env.JWT_SECRET;
apps/pos-backend/tests/unit/pin-lookup.test.js:10:    process.env.JWT_SECRET = "test-pin-lookup-secret";
apps/pos-backend/tests/unit/pin-lookup.test.js:15:      delete process.env.JWT_SECRET;
apps/pos-backend/tests/unit/pin-lookup.test.js:17:      process.env.JWT_SECRET = originalSecret;
apps/pos-backend/tests/unit/inventory-org-location-policy.test.js:10:  if (!process.env.MONGODB_URI) {
apps/pos-backend/tests/unit/inventory-org-location-policy.test.js:16:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/tests/unit/inventory-org-location-policy.test.js:34:  if (!process.env.MONGODB_URI) {
apps/pos-backend/tests/unit/inventory-org-location-policy.test.js:41:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:12:  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:13:  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:18:      delete process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:20:      process.env.FINANCE_INTERNAL_BASE_URL = prev;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:26:  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:27:  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:39:      delete process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:41:      process.env.FINANCE_INTERNAL_BASE_URL = prev;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:47:  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:48:  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:68:      delete process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:70:      process.env.FINANCE_INTERNAL_BASE_URL = prev;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:76:  const prev = process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:77:  process.env.FINANCE_INTERNAL_BASE_URL = "http://finance:3000";
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:89:      delete process.env.FINANCE_INTERNAL_BASE_URL;
apps/pos-backend/tests/unit/combined-org-provision-guard.test.js:91:      process.env.FINANCE_INTERNAL_BASE_URL = prev;
apps/pos-backend/tests/unit/license-window-service.test.js:5:  process.env.LICENSE_ENFORCEMENT_MODE = mode;
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:14:  if (process.env.RUN_RBAC_ORG_ISOLATION === "1") {
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:20:  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") return;
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:32:  if (process.env.RUN_RBAC_ORG_ISOLATION !== "1") {
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:37:  process.env.JWT_SECRET =
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:38:    process.env.JWT_SECRET || "test_jwt_secret_min_32_chars_long_______";
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:39:  process.env.MONGODB_URI =
apps/pos-backend/tests/unit/rbac-org-isolation.test.js:40:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-rbac-org-isolation";
apps/pos-backend/tests/unit/bootstrap-credential-reveal.test.js:8:  process.env.REDIS_URL = "";
apps/pos-backend/tests/unit/platform-auth-controller.test.js:7:  const previousEnv = process.env.NODE_ENV;
apps/pos-backend/tests/unit/platform-auth-controller.test.js:8:  process.env.NODE_ENV = "production";
apps/pos-backend/tests/unit/platform-auth-controller.test.js:15:  process.env.NODE_ENV = previousEnv;
apps/pos-backend/tests/unit/platform-auth-controller.test.js:19:  const previousEnv = process.env.NODE_ENV;
apps/pos-backend/tests/unit/platform-auth-controller.test.js:20:  process.env.NODE_ENV = "production";
apps/pos-backend/tests/unit/platform-auth-controller.test.js:27:  process.env.NODE_ENV = previousEnv;
apps/pos-backend/tests/unit/platform-auth-controller.test.js:31:  const previousEnv = process.env.NODE_ENV;
apps/pos-backend/tests/unit/platform-auth-controller.test.js:32:  process.env.NODE_ENV = "development";
apps/pos-backend/tests/unit/platform-auth-controller.test.js:39:  process.env.NODE_ENV = previousEnv;
apps/pos-backend/migrations/2026-04-10-005-accounting-org-scope.js:9:  const envId = process.env.DEFAULT_ORG_ID;
apps/pos-backend/migrations/orgBackfillMigrations.js:9:  const envId = process.env.DEFAULT_ORG_ID;
apps/pos-backend/migrations/orgBackfillMigrations.js:168:        process.env.MIGRATION_FIX_INGREDIENT_CATEGORY_ORPHANS === "1" &&
apps/pos-backend/controllers/platformOrgController.js:520:      config.licenseSigningSecret || process.env.LICENSE_SIGNING_SECRET || "";
apps/pos-backend/controllers/platformAuthController.js:14:  return process.env.NODE_ENV === "production";
apps/pos-backend/controllers/platformStreamController.js:42:      auditsEnabled: String(process.env.PLATFORM_SSE_AUDITS || "1") !== "0",
apps/pos-backend/controllers/platformStreamController.js:47:    Number.parseInt(String(process.env.PLATFORM_SSE_PING_MS || "25000"), 10) || 25000,
apps/pos-backend/controllers/platformStreamController.js:52:    Number.parseInt(String(process.env.PLATFORM_SSE_POLL_MS || "15000"), 10) || 15000,
apps/pos-backend/controllers/platformStreamController.js:60:    Number.parseInt(String(process.env.PLATFORM_SSE_MAX_PENDING_BYTES || "524288"), 10) ||
apps/pos-backend/controllers/platformStreamController.js:85:      if (String(process.env.PLATFORM_SSE_AUDITS || "1") !== "0") {
apps/pos-backend/controllers/authController.js:605:    const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET;
apps/pos-backend/controllers/locationController.js:392:    const secret = process.env.INTERNAL_API_SECRET;
apps/pos-backend/controllers/locationController.js:394:      const cpUrl = process.env.CONTROL_PLANE_INTERNAL_URL;
apps/pos-backend/middlewares/verifyStockixJWT.js:4:const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET;
apps/pos-backend/middlewares/posHostPatterns.js:5:  return String(process.env.ROOT_DOMAIN || "localhost").toLowerCase().trim();
apps/pos-backend/middlewares/posHostPatterns.js:19:    process.env.POS_LEGACY_SUBDOMAIN_SUFFIX || ".pos.zerowix.cloud"
apps/pos-backend/middlewares/posHostPatterns.js:32:    process.env.POS_LEGACY_SUBDOMAIN_SUFFIX || ".pos.zerowix.cloud"
apps/pos-backend/middlewares/tokenVerification.js:7:const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET;
apps/pos-backend/middlewares/tokenVerification.js:23:  if (AUTH_TOKEN_SECRET && process.env.STOCKIX_JWT_ENABLED !== "0") {
apps/pos-backend/middlewares/requireActiveOrganization.js:42:      signingSecret: config.licenseSigningSecret || process.env.LICENSE_SIGNING_SECRET || "",
apps/pos-backend/services/reportScheduleService.js:103:    { timezone: process.env.REPORT_SCHEDULE_TZ || "UTC" }
apps/pos-backend/services/combinedOrgProvisionGuard.js:9:  return Boolean(String(process.env.FINANCE_INTERNAL_BASE_URL || "").trim());
apps/pos-backend/services/storageService.js:11:  process.env.B2_KEY_ID &&
apps/pos-backend/services/storageService.js:12:  process.env.B2_APP_KEY &&
apps/pos-backend/services/storageService.js:13:  process.env.B2_BUCKET_NAME;
apps/pos-backend/services/storageService.js:16:const b2Endpoint = process.env.B2_ENDPOINT || "s3.us-east-005.backblazeb2.com";
apps/pos-backend/services/storageService.js:17:const b2Region = process.env.B2_REGION || "us-east-005";
apps/pos-backend/services/storageService.js:19:  process.env.B2_PUBLIC_BASE_URL || process.env.UPLOADS_PUBLIC_ORIGIN || "";
apps/pos-backend/services/storageService.js:35:      accessKeyId: process.env.B2_KEY_ID,
apps/pos-backend/services/storageService.js:36:      secretAccessKey: process.env.B2_APP_KEY,
apps/pos-backend/services/storageService.js:73:  return `https://${process.env.B2_BUCKET_NAME}.${b2Endpoint}/${normalizedKey}`;
apps/pos-backend/services/storageService.js:111:  const bucket = String(process.env.B2_BUCKET_NAME || "").toLowerCase();
apps/pos-backend/services/storageService.js:151:    Bucket: process.env.B2_BUCKET_NAME,
apps/pos-backend/services/storageService.js:183:    Bucket: process.env.B2_BUCKET_NAME,
apps/pos-backend/services/posSocketServer.js:103:      Number.parseInt(String(process.env.POS_SOCKET_CLIENT_WINDOW_MS || "10000"), 10) ||
apps/pos-backend/services/posSocketServer.js:111:      Number.parseInt(String(process.env.POS_SOCKET_CLIENT_MAX_PACKETS || "200"), 10) ||
apps/pos-backend/services/ensureProvisionPlatformApiKey.js:12:  const raw = process.env.POS_PLATFORM_API_KEY;
apps/pos-backend/services/printDispatchService.js:5:  if (String(process.env.PRINTER_MODE || "").toLowerCase() === "fake") {
apps/pos-backend/services/jobQueue.js:49:const PREFIX = process.env.REDIS_KEY_PREFIX ?? "";
apps/pos-backend/services/redisKeys.js:10:  const prefix = process.env.REDIS_KEY_PREFIX ?? "";
apps/pos-backend/services/orgAccessCache.js:7:    String(process.env.ORG_ACCESS_CACHE_TTL_SECONDS || "120"),
apps/pos-backend/services/fakePrinterRedirect.js:10:  return String(process.env.PRINTER_MODE || "").toLowerCase() === "fake";
apps/pos-backend/services/fakePrinterRedirect.js:14:  const raw = process.env.FAKE_PRINTER_PORTS || "{}";
apps/pos-backend/services/fakePrinterRedirect.js:39:    Number(process.env.FAKE_PRINTER_DEFAULT_PORT || 9100);
apps/pos-backend/services/fakePrinterRedirect.js:42:  const fakeHost = String(process.env.FAKE_PRINTER_HOST || "127.0.0.1").trim() || "127.0.0.1";
apps/pos-backend/services/posSocketRedisAdapter.js:18:        String(process.env.POS_SOCKET_REDIS_CONNECT_TIMEOUT_MS || "2500"),
apps/pos-backend/scripts/staff-entitlements-selftest.js:16:  if (process.env.RUN_STAFF_ENTITLEMENTS_SELFTEST !== "1") {
apps/pos-backend/scripts/seedDevStaff.js:36:    process.env.NODE_ENV === "production" &&
apps/pos-backend/scripts/seedDevStaff.js:37:    process.env.ALLOW_DEV_SEED !== "1"
apps/pos-backend/scripts/seedDevStaff.js:48:    const slug = process.env.SEED_ORG_SLUG || "dev-org";
apps/pos-backend/scripts/verify-customer-deposit-gap.js:16:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-customer-deposit-gap.js:21:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/seedInventoryUiShowcase.js:59:  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "1") {
apps/pos-backend/scripts/seedInventoryUiShowcase.js:180:  const slug = process.env.SEED_ORG_SLUG || "dev-org";
apps/pos-backend/scripts/migrate-users-multi-branch.js:6:  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
apps/pos-backend/scripts/inventory-http-smoke.js:37:const BASE = (process.env.API_BASE || "http://127.0.0.1:8010").replace(/\/$/, "");
apps/pos-backend/scripts/inventory-http-smoke.js:38:const PIN = process.env.INVENTORY_SMOKE_PIN || "1001";
apps/pos-backend/scripts/inventory-http-smoke.js:39:const WAITER_PIN = process.env.INVENTORY_SMOKE_WAITER_PIN || "1003";
apps/pos-backend/scripts/inventory-http-smoke.js:40:const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";
apps/pos-backend/scripts/inventory-http-smoke.js:41:const TRY_WAREHOUSE_PATCH = process.env.INVENTORY_SMOKE_WAREHOUSE_PATCH === "1";
apps/pos-backend/scripts/inventory-http-smoke.js:42:const AUTO_APPROVE_DEVICE = process.env.INVENTORY_SMOKE_AUTO_APPROVE_DEVICE !== "0";
apps/pos-backend/scripts/seed-floor-plan-showcase.js:28:  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SEED !== "1") {
apps/pos-backend/scripts/seed-floor-plan-showcase.js:121:  const slug = process.env.SEED_ORG_SLUG || "dev-org";
apps/pos-backend/scripts/seedPlatformOwner.js:15:  const email = process.env.PLATFORM_OWNER_EMAIL;
apps/pos-backend/scripts/seedPlatformOwner.js:16:  const password = process.env.PLATFORM_OWNER_PASSWORD;
apps/pos-backend/scripts/seedAdmin.js:15:  const pin = process.env.BOOTSTRAP_ADMIN_PIN;
apps/pos-backend/scripts/seedAdmin.js:33:    const name = process.env.BOOTSTRAP_ADMIN_NAME || "Admin";
apps/pos-backend/scripts/seedAdmin.js:34:    const phone = process.env.BOOTSTRAP_ADMIN_PHONE
apps/pos-backend/scripts/seedAdmin.js:35:      ? String(process.env.BOOTSTRAP_ADMIN_PHONE).trim()
apps/pos-backend/scripts/seedAdmin.js:37:    const emailEnv = process.env.BOOTSTRAP_ADMIN_EMAIL
apps/pos-backend/scripts/seedAdmin.js:38:      ? String(process.env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase()
apps/pos-backend/scripts/seedAdmin.js:40:    const passwordEnv = process.env.BOOTSTRAP_ADMIN_PASSWORD
apps/pos-backend/scripts/seedAdmin.js:41:      ? String(process.env.BOOTSTRAP_ADMIN_PASSWORD)
apps/pos-backend/scripts/rbac-default-roles-test.js:11:const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
apps/pos-backend/scripts/seedAccounting.js:29:  if (process.env.SEED_ACCOUNTING_DUMMY === "1") {
apps/pos-backend/scripts/seedMenu.js:49:  const slug = process.env.SEED_ORG_SLUG || "dev-org";
apps/pos-backend/scripts/verify-invoice-tax-gap.js:15:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-invoice-tax-gap.js:20:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/floor-feature-full-selftest.js:18:const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
apps/pos-backend/scripts/accounting-mandatory-automated.js:36:if (process.env.MONGODB_URI) {
apps/pos-backend/scripts/rbac-smoke-test.js:11:const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
apps/pos-backend/scripts/verify-invoice-lifecycle-gap.js:15:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-invoice-lifecycle-gap.js:20:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/setup_testing_master_data.js:18:  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/pos");
apps/pos-backend/scripts/organization-tenant-url-selftest.js:39:  process.env.ORG_TENANT_SELFTEST_API_BASE ||
apps/pos-backend/scripts/organization-tenant-url-selftest.js:40:  process.env.PLATFORM_SELFTEST_BASE_URL ||
apps/pos-backend/scripts/organization-tenant-url-selftest.js:43:  process.env.ORG_TENANT_SELFTEST_TENANT_APP_BASE || "http://localhost:3000";
apps/pos-backend/scripts/organization-tenant-url-selftest.js:45:  String(process.env.ORG_TENANT_SELFTEST_SKIP_TENANT_HTTP || "") === "1";
apps/pos-backend/scripts/organization-tenant-url-selftest.js:46:const SKIP_PIN = String(process.env.ORG_TENANT_SELFTEST_SKIP_PIN || "") === "1";
apps/pos-backend/scripts/organization-tenant-url-selftest.js:47:const CLEANUP = String(process.env.ORG_TENANT_SELFTEST_CLEANUP || "") === "1";
apps/pos-backend/scripts/organization-tenant-url-selftest.js:49:  process.env.ORG_TENANT_SELFTEST_BOOTSTRAP_WAIT_MS || 120_000,
apps/pos-backend/scripts/organization-tenant-url-selftest.js:52:const PLATFORM_EMAIL = process.env.PLATFORM_OWNER_EMAIL || "";
apps/pos-backend/scripts/organization-tenant-url-selftest.js:53:const PLATFORM_PASSWORD = process.env.PLATFORM_OWNER_PASSWORD || "";
apps/pos-backend/scripts/seedProfessionalMenu.js:27:    orgSlug: byFlag("org") || process.env.ORG_SLUG || "montaser-pos-tes",
apps/pos-backend/scripts/verify-vendor-bill-gap.js:19:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-vendor-bill-gap.js:24:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/saas-integration-selftest.js:106:  process.env.JWT_SECRET =
apps/pos-backend/scripts/saas-integration-selftest.js:107:    process.env.JWT_SECRET ||
apps/pos-backend/scripts/saas-integration-selftest.js:109:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/scripts/saas-integration-selftest.js:110:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/scripts/saas-integration-selftest.js:112:  process.env.MONGODB_URI =
apps/pos-backend/scripts/saas-integration-selftest.js:113:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-saas-selftest";
apps/pos-backend/scripts/saas-integration-selftest.js:115:  console.log("SaaS integration self-test\n  DB:", process.env.MONGODB_URI);
apps/pos-backend/scripts/saas-integration-selftest.js:405:    await cleanup(cleanupCtx, process.env.SELFTEST_KEEP_DATA === "1");
apps/pos-backend/scripts/phase1-tokens-selftest.js:5:process.env.JWT_SECRET = process.env.JWT_SECRET || "selftest-jwt-secret-min-32-chars!!";
apps/pos-backend/scripts/phase1-tokens-selftest.js:6:delete process.env.JWT_REFRESH_SECRET;
apps/pos-backend/scripts/full-api-surface-test.js:449:  process.env.JWT_SECRET =
apps/pos-backend/scripts/full-api-surface-test.js:450:    process.env.JWT_SECRET ||
apps/pos-backend/scripts/full-api-surface-test.js:452:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/scripts/full-api-surface-test.js:453:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/scripts/full-api-surface-test.js:455:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/socket-redis-adapter-selftest.js:12:  const url = process.env.REDIS_URL?.trim();
apps/pos-backend/scripts/inventory-integration-seed-test.js:133:const HTTP = process.env.INVENTORY_HTTP === "1" || process.env.INVENTORY_HTTP === "true";
apps/pos-backend/scripts/inventory-integration-seed-test.js:134:const API_BASE = (process.env.API_BASE_URL || "").replace(/\/$/, "");
apps/pos-backend/scripts/inventory-integration-seed-test.js:135:const API_TOKEN = process.env.INVENTORY_ACCESS_TOKEN || "";
apps/pos-backend/scripts/migrate-single-tenant-org.js:71:  const slug = process.env.DEFAULT_ORG_SLUG || "default-restaurant";
apps/pos-backend/scripts/migrate-single-tenant-org.js:75:      name: process.env.DEFAULT_ORG_NAME || "Default Restaurant",
apps/pos-backend/scripts/rbac-permissions-matrix-test.js:25:const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
apps/pos-backend/scripts/rbac-permissions-matrix-test.js:26:const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";
apps/pos-backend/scripts/rbac-permissions-matrix-test.js:145:  const raw = process.env.RBAC_MATRIX_BEARERS_JSON;
apps/pos-backend/scripts/order-lifecycle-selftest.js:28:  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
apps/pos-backend/scripts/seedPlatformSupportRead.js:12:  const email = process.env.PLATFORM_SUPPORT_READ_EMAIL;
apps/pos-backend/scripts/seedPlatformSupportRead.js:13:  const password = process.env.PLATFORM_SUPPORT_READ_PASSWORD;
apps/pos-backend/scripts/verify-grni-gap.js:16:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-grni-gap.js:21:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/saas-owner-dashboard-api-test.js:40:  process.env.PLATFORM_DASHBOARD_TEST_BASE_URL ||
apps/pos-backend/scripts/saas-owner-dashboard-api-test.js:41:  process.env.PLATFORM_SELFTEST_BASE_URL ||
apps/pos-backend/scripts/saas-owner-dashboard-api-test.js:128:  const email = process.env.PLATFORM_OWNER_EMAIL;
apps/pos-backend/scripts/saas-owner-dashboard-api-test.js:129:  const password = process.env.PLATFORM_OWNER_PASSWORD;
apps/pos-backend/scripts/autoApprove.js:15:const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/posv2';
apps/pos-backend/scripts/repairCredentialsFast.js:9:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/parent-category-coverage-audit.js:125:  const uri = process.env.MONGODB_URI;
apps/pos-backend/scripts/parent-category-coverage-audit.js:132:  const rawOrg = process.env.PARENT_AUDIT_ORG_ID;
apps/pos-backend/scripts/accounting-studio-verification.js:71:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/accounting-studio-verification.js:76:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/platform-api-selftest.js:10:  process.env.PLATFORM_SELFTEST_BASE_URL || "http://127.0.0.1:8010";
apps/pos-backend/scripts/platform-api-selftest.js:47:  const em = process.env.PLATFORM_OWNER_EMAIL;
apps/pos-backend/scripts/platform-api-selftest.js:48:  const pw = process.env.PLATFORM_OWNER_PASSWORD;
apps/pos-backend/scripts/seedInventoryProfessionalScenario.js:41:  const targetOrg = orgSlug || process.env.SEED_ORG_SLUG || "dev-org";
apps/pos-backend/scripts/verify-credit-note-gap.js:17:  if (!process.env.MONGODB_URI) {
apps/pos-backend/scripts/verify-credit-note-gap.js:22:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/scripts/accounting-api-check.js:511:  const base = process.env.API_BASE_URL || "http://localhost:4444";
apps/pos-backend/scripts/accounting-api-check.js:512:  const email = process.env.ACCOUNTING_LOGIN_EMAIL;
apps/pos-backend/scripts/accounting-api-check.js:513:  const password = process.env.ACCOUNTING_LOGIN_PASSWORD;
apps/pos-backend/scripts/accounting-api-check.js:567:  if (process.env.ACCOUNTING_HTTP === "1") await runHttpSmoke();
apps/pos-backend/scripts/table-floor-phase1-selftest.js:9:const BASE = process.env.API_BASE || "http://127.0.0.1:8010";
apps/pos-backend/scripts/subdomain-org-selftest.js:54:  process.env.NODE_ENV = "development";
apps/pos-backend/scripts/subdomain-org-selftest.js:55:  process.env.JWT_SECRET =
apps/pos-backend/scripts/subdomain-org-selftest.js:56:    process.env.JWT_SECRET || "test_jwt_secret_min_32_chars_long_______";
apps/pos-backend/scripts/subdomain-org-selftest.js:57:  process.env.PLATFORM_JWT_SECRET =
apps/pos-backend/scripts/subdomain-org-selftest.js:58:    process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/scripts/subdomain-org-selftest.js:60:  process.env.MONGODB_URI =
apps/pos-backend/scripts/subdomain-org-selftest.js:61:    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pos-subdomain-selftest";
apps/pos-backend/scripts/subdomain-org-selftest.js:64:  console.log("  DB:", process.env.MONGODB_URI);
apps/pos-backend/scripts/subdomain-org-selftest.js:99:    if (String(process.env.SELFTEST_KEEP_DATA || "") === "1") {
apps/pos-backend/scripts/repairCredentials.js:12:  await mongoose.connect(process.env.MONGODB_URI);
apps/pos-backend/config/env-validate.js:26:if (process.env.NODE_ENV === "production") {
apps/pos-backend/config/config.js:9:const jwtSecret = process.env.JWT_SECRET;
apps/pos-backend/config/config.js:11:const pinLookupHmacKey = process.env.PIN_LOOKUP_SECRET || jwtSecret;
apps/pos-backend/config/config.js:13:  process.env.JWT_REFRESH_SECRET ||
apps/pos-backend/config/config.js:17:  process.env.PLATFORM_JWT_SECRET ||
apps/pos-backend/config/config.js:18:  (process.env.NODE_ENV !== "production" && jwtSecret
apps/pos-backend/config/config.js:22:  process.env.PLATFORM_JWT_REFRESH_SECRET ||
apps/pos-backend/config/config.js:25:const redisUrl = process.env.REDIS_URL || "";
apps/pos-backend/config/config.js:26:const resendApiKey = process.env.RESEND_API_KEY || "";
apps/pos-backend/config/config.js:27:const sentryDsn = process.env.SENTRY_DSN || "";
apps/pos-backend/config/config.js:28:const fieldEncryptionKeyB64 = process.env.FIELD_ENCRYPTION_KEY || "";
apps/pos-backend/config/config.js:30:  String(process.env.PLATFORM_IMPERSONATION_ENABLED || "").toLowerCase() ===
apps/pos-backend/config/config.js:33:if (!process.env.PUBLIC_APP_URL && process.env.NODE_ENV === "production") {
apps/pos-backend/config/config.js:37:  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:5173";
apps/pos-backend/config/config.js:54:const corsOriginsFromEnv = process.env.CORS_ORIGINS
apps/pos-backend/config/config.js:55:  ? process.env.CORS_ORIGINS.split(",")
apps/pos-backend/config/config.js:71:const mongoUri = process.env.MONGODB_URI;
apps/pos-backend/config/config.js:72:if (!mongoUri && process.env.NODE_ENV === "production") {
apps/pos-backend/config/config.js:82:  port: process.env.PORT || 3000,
apps/pos-backend/config/config.js:84:  nodeEnv: process.env.NODE_ENV || "development",
apps/pos-backend/config/config.js:90:    (process.env.NODE_ENV || "development") !== "production" &&
apps/pos-backend/config/config.js:91:    String(process.env.POS_DEV_CROSS_SITE_COOKIES || "").toLowerCase() === "true",
apps/pos-backend/config/config.js:96:  accessTokenSecretPrevious: process.env.JWT_SECRET_PREVIOUS || null,
apps/pos-backend/config/config.js:98:  refreshTokenSecretPrevious: process.env.JWT_REFRESH_SECRET_PREVIOUS || null,
apps/pos-backend/config/config.js:99:  accessTokenExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
apps/pos-backend/config/config.js:100:  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
apps/pos-backend/config/config.js:103:    process.env.PLATFORM_JWT_SECRET_PREVIOUS || null,
apps/pos-backend/config/config.js:106:    process.env.PLATFORM_JWT_REFRESH_SECRET_PREVIOUS || null,
apps/pos-backend/config/config.js:108:    process.env.PLATFORM_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "1d",
apps/pos-backend/config/config.js:110:    process.env.PLATFORM_JWT_REFRESH_EXPIRES_IN ||
apps/pos-backend/config/config.js:111:    process.env.JWT_REFRESH_EXPIRES_IN ||
apps/pos-backend/config/config.js:115:  resendFromEmail: process.env.RESEND_FROM_EMAIL || "",
apps/pos-backend/config/config.js:121:    process.env.SLO_AVAILABILITY_TARGET || "0.999"
apps/pos-backend/config/config.js:123:  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
apps/pos-backend/config/config.js:124:  razorpaySecretKey: process.env.RAZORPAY_KEY_SECRET,
apps/pos-backend/config/config.js:125:  razorpyWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
apps/pos-backend/config/config.js:130:    (process.env.TENANT_APP_ORIGIN || publicAppUrl || "").replace(/\/$/, "") ||
apps/pos-backend/config/config.js:134:    String(process.env.RATE_LIMIT_ORG_KEYS || "").toLowerCase() === "true",
apps/pos-backend/config/config.js:136:  platformCorsOrigins: process.env.PLATFORM_CORS_ORIGINS
apps/pos-backend/config/config.js:137:    ? process.env.PLATFORM_CORS_ORIGINS.split(",")
apps/pos-backend/config/config.js:143:    const mode = String(process.env.LICENSE_ENFORCEMENT_MODE || "enforce")
apps/pos-backend/config/config.js:149:  stockixTenantId: process.env.TENANT_ID
apps/pos-backend/config/config.js:150:    ? String(process.env.TENANT_ID).trim()
apps/pos-backend/config/config.js:152:  licenseSigningSecret: process.env.LICENSE_SIGNING_SECRET
apps/pos-backend/config/config.js:153:    ? String(process.env.LICENSE_SIGNING_SECRET).trim()
apps/pos-backend/config/database.js:12:  const fromEnv = String(process.env.MONGODB_DNS_SERVERS || "")
```
### Directory: services/pms/src/
```text
services/pms/src/server.ts:32:  const port = parseInt(process.env.PMS_PORT ?? String(pmsConfig.port), 10) || 3003;
services/pms/src/lib/pii-crypto.ts:17:  const hex = process.env.PMS_FIELD_ENCRYPTION_KEY?.trim();
services/pms/src/jobs/finance-sync-job.ts:13:const SYNC_INTERVAL_MS = parseInt(process.env.PMS_FINANCE_SYNC_INTERVAL_MS ?? "900000", 10); // 15 min
services/pms/src/index.ts:29:const corsOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [];
services/pms/src/index.ts:208:  const internalSecret = process.env.PLATFORM_API_SECRET?.trim();
```
### Directory: services/stockix-finance/packages/server/src/
```text
services/stockix-finance/packages/server/src/libs/chromiumly/Chromiumly.ts:4:  public static readonly GOTENBERG_ENDPOINT = process.env.GOTENBERG_URL || '';
services/stockix-finance/packages/server/src/libs/chromiumly/Chromiumly.ts:11:    process.env.GOTENBERG_DOCS_URL || '';
services/stockix-finance/packages/server/src/libs/migration-seed/Utils.ts:11:  if (process.env.npm_package_json) {
services/stockix-finance/packages/server/src/libs/migration-seed/Utils.ts:16:      await readFile(process.env.npm_package_json, 'utf-8'),
services/stockix-finance/packages/server/src/libs/migration-seed/Utils.ts:22:  return process.env.npm_package_type === 'module' || filepath.endsWith('.mjs');
services/stockix-finance/packages/server/src/main.ts:43:const sentryDsn = process.env.SENTRY_DSN?.trim();
services/stockix-finance/packages/server/src/main.ts:47:    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
services/stockix-finance/packages/server/src/main.ts:63:  if (corsOrigins.length === 0 && process.env.NODE_ENV === 'production') {
services/stockix-finance/packages/server/src/main.ts:110:  app.use(json({ limit: process.env.REQUEST_BODY_LIMIT ?? '2mb' }));
services/stockix-finance/packages/server/src/main.ts:112:    urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT ?? '2mb' }),
services/stockix-finance/packages/server/src/main.ts:127:  await app.listen(process.env.PORT ?? 3000);
services/stockix-finance/packages/server/src/modules/Mail/Mail.utils.ts:12:  fallbackName = process.env.MAIL_FROM_NAME,
services/stockix-finance/packages/server/src/modules/Mail/Mail.utils.ts:13:  fallbackAddress = process.env.MAIL_FROM_ADDRESS,
services/stockix-finance/packages/server/src/modules/TenantDBManager/TenantsManager.ts:115:    if (process.env.NODE_ENV !== 'production') {
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:16:  for (const entry of (process.env.SOCKET_ALLOWED_ORIGINS ?? '').split(',')) {
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:21:  const publicBase = process.env.PUBLIC_BASE_URL?.trim() || process.env.BASE_URL?.trim();
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:26:  const proxyPort = process.env.PUBLIC_PROXY_PORT?.trim();
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:42:  if (origins.size === 0 && process.env.NODE_ENV !== 'production') {
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:84:  const proxyPort = process.env.PUBLIC_PROXY_PORT?.trim();
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.ts:85:  const publicBase = process.env.PUBLIC_BASE_URL?.trim() || process.env.BASE_URL?.trim();
services/stockix-finance/packages/server/src/modules/Socket/Socket.gateway.ts:25:      if (allowed.length === 0 && process.env.NODE_ENV === 'production') {
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.test.ts:16:    process.env.SOCKET_ALLOWED_ORIGINS = "http://my-tenant.localhost";
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.test.ts:17:    process.env.PUBLIC_BASE_URL = "http://my-tenant.localhost";
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.test.ts:18:    process.env.PUBLIC_PROXY_PORT = "4300";
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.test.ts:42:    process.env.PUBLIC_PROXY_PORT = "4300";
services/stockix-finance/packages/server/src/modules/Socket/socket-allowed-origins.test.ts:43:    process.env.PUBLIC_BASE_URL = "http://my-tenant.localhost";
services/stockix-finance/packages/server/src/modules/Dashboard/Dashboard.service.ts:52:    const billingEnabled = process.env.BILLING_ENABLED === 'true';
services/stockix-finance/packages/server/src/modules/ExchangeRates/lib/OpenExchangeRate.ts:13:    this.appId = appId || process.env.OPEN_EXCHANGE_RATE_APP_ID || '';
services/stockix-finance/packages/server/src/modules/Auth/queries/GetAuthMeta.service.ts:28:      billingEnabled: process.env.BILLING_ENABLED === 'true',
services/stockix-finance/packages/server/src/modules/Subscription/utils.ts:24:    apiKey: process.env.LEMONSQUEEZY_API_KEY,
services/stockix-finance/packages/server/src/modules/Subscription/Subscriptions.controller.ts:22:    if (process.env.BILLING_ENABLED !== 'true') {
services/stockix-finance/packages/server/src/modules/App/App.module.ts:175:        prefix: process.env.REDIS_KEY_PREFIX 
services/stockix-finance/packages/server/src/modules/App/App.module.ts:176:          ? `bull:${process.env.REDIS_KEY_PREFIX.replace(/:$/, '')}`
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:47:          process.env.NODE_ENV === 'test' ||
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:48:          process.env.JEST_WORKER_ID !== undefined;
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:57:        const redisPrefix = process.env.REDIS_KEY_PREFIX ?? '';
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:60:          host: process.env.REDIS_HOST || 'localhost',
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:61:          port: parseInt(process.env.REDIS_PORT || '6379', 10),
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:62:          password: process.env.REDIS_PASSWORD || undefined,
services/stockix-finance/packages/server/src/modules/App/AppThrottle.module.ts:63:          db: parseInt(process.env.REDIS_DB || '0', 10),
services/stockix-finance/packages/server/src/modules/License/LicenseCacheService.ts:26:    const prefix = process.env.REDIS_KEY_PREFIX ?? '';
services/stockix-finance/packages/server/src/bootstrap-decrypt-env.ts:20:decryptEncryptedEnvVars(SENSITIVE_ENV_KEYS, process.env.DEPLOYMENT_SECRET_KEY?.trim());
services/stockix-finance/packages/server/src/config/knexConfig.ts:11:      port: parseMysqlPort(process.env.TENANT_DB_PORT || process.env.DB_PORT),
services/stockix-finance/packages/server/src/config/knexConfig.ts:35:    port: parseMysqlPort(process.env.SYSTEM_DB_PORT || process.env.DB_PORT),
services/stockix-finance/packages/server/src/config/index.ts:6:if (process.env.NODE_ENV !== 'production') {
services/stockix-finance/packages/server/src/config/index.ts:11:if (process.env.NODE_ENV === 'production') {
services/stockix-finance/packages/server/src/config/index.ts:34:  port: parseInt(process.env.PORT, 10),
services/stockix-finance/packages/server/src/config/index.ts:40:    db_client: process.env.SYSTEM_DB_CLIENT || process.env.DB_CLIENT || 'mysql',
services/stockix-finance/packages/server/src/config/index.ts:41:    db_host: process.env.SYSTEM_DB_HOST || process.env.DB_HOST,
services/stockix-finance/packages/server/src/config/index.ts:42:    db_user: process.env.SYSTEM_DB_USER || process.env.DB_USER,
services/stockix-finance/packages/server/src/config/index.ts:43:    db_password: process.env.SYSTEM_DB_PASSWORD || process.env.DB_PASSWORD,
services/stockix-finance/packages/server/src/config/index.ts:44:    db_name: process.env.SYSTEM_DB_NAME,
services/stockix-finance/packages/server/src/config/index.ts:45:    charset: process.env.SYSTEM_DB_CHARSET || process.env.DB_CHARSET,
services/stockix-finance/packages/server/src/config/index.ts:54:    db_client: process.env.TENANT_DB_CLIENT || process.env.DB_CLIENT || 'mysql',
services/stockix-finance/packages/server/src/config/index.ts:55:    db_name_prefix: process.env.TENANT_DB_NAME_PREFIX || process.env.TENANT_DB_NAME_PERFIX,
services/stockix-finance/packages/server/src/config/index.ts:56:    db_host: process.env.TENANT_DB_HOST || process.env.DB_HOST,
services/stockix-finance/packages/server/src/config/index.ts:57:    db_user: process.env.TENANT_DB_USER || process.env.DB_USER,
services/stockix-finance/packages/server/src/config/index.ts:58:    db_password: process.env.TENANT_DB_PASSWORD || process.env.DB_PASSWORD,
services/stockix-finance/packages/server/src/config/index.ts:59:    charset: process.env.TENANT_DB_CHARSET || process.env.DB_CHARSET,
services/stockix-finance/packages/server/src/config/index.ts:68:    superUser: process.env.SYSTEM_DB_USER || process.env.DB_USER,
services/stockix-finance/packages/server/src/config/index.ts:69:    superPassword: process.env.SYSTEM_DB_PASSWORD || process.env.DB_PASSWORD,
services/stockix-finance/packages/server/src/config/index.ts:76:    host: process.env.MAIL_HOST,
services/stockix-finance/packages/server/src/config/index.ts:77:    port: process.env.MAIL_PORT,
services/stockix-finance/packages/server/src/config/index.ts:78:    secure: !!parseInt(process.env.MAIL_SECURE, 10),
services/stockix-finance/packages/server/src/config/index.ts:79:    username: process.env.MAIL_USERNAME,
services/stockix-finance/packages/server/src/config/index.ts:80:    password: process.env.MAIL_PASSWORD,
services/stockix-finance/packages/server/src/config/index.ts:90:    databaseURL: process.env.MONGODB_DATABASE_URL,
services/stockix-finance/packages/server/src/config/index.ts:97:    dbCollection: process.env.AGENDA_DB_COLLECTION,
services/stockix-finance/packages/server/src/config/index.ts:98:    pooltime: process.env.AGENDA_POOL_TIME,
services/stockix-finance/packages/server/src/config/index.ts:99:    concurrency: parseInt(process.env.AGENDA_CONCURRENCY, 10),
services/stockix-finance/packages/server/src/config/index.ts:106:  // ORIGINAL:   user: process.env.AGENDASH_AUTH_USER,
services/stockix-finance/packages/server/src/config/index.ts:107:  // ORIGINAL:   password: process.env.AGENDASH_AUTH_PASSWORD,
services/stockix-finance/packages/server/src/config/index.ts:114:    api_key: process.env.EASY_SMS_TOKEN,
services/stockix-finance/packages/server/src/config/index.ts:120:  jwtSecret: process.env.JWT_SECRET,
services/stockix-finance/packages/server/src/config/index.ts:130:  baseURL: process.env.BASE_URL,
services/stockix-finance/packages/server/src/config/index.ts:166:    disabled: parseBoolean<boolean>(process.env.SIGNUP_DISABLED, false),
services/stockix-finance/packages/server/src/config/index.ts:168:      process.env.SIGNUP_ALLOWED_DOMAINS
services/stockix-finance/packages/server/src/config/index.ts:171:      process.env.SIGNUP_ALLOWED_EMAILS
services/stockix-finance/packages/server/src/config/index.ts:179:    browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT,
services/stockix-finance/packages/server/src/common/middleware/migration-mode.middleware.ts:19:      process.env.MIGRATION_MODE === 'true' ||
services/stockix-finance/packages/server/src/common/middleware/migration-mode.middleware.ts:20:      process.env.MIGRATION_MODE === '1';
services/stockix-finance/packages/server/src/common/filters/global-exception.filter.ts:41:    const isProduction = process.env.NODE_ENV === 'production';
services/stockix-finance/packages/server/src/common/http/http-allowed-origins.ts:13:  for (const entry of (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
services/stockix-finance/packages/server/src/common/config/throttle.ts:5:    ttl: parseInt(process.env.THROTTLE_GLOBAL_TTL ?? '60000', 10),
services/stockix-finance/packages/server/src/common/config/throttle.ts:6:    limit: parseInt(process.env.THROTTLE_GLOBAL_LIMIT ?? '100', 10),
services/stockix-finance/packages/server/src/common/config/throttle.ts:9:    ttl: parseInt(process.env.THROTTLE_AUTH_TTL ?? '60000', 10),
services/stockix-finance/packages/server/src/common/config/throttle.ts:10:    limit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '10', 10),
services/stockix-finance/packages/server/src/common/config/mail.ts:4:  host: process.env.MAIL_HOST,
services/stockix-finance/packages/server/src/common/config/mail.ts:5:  username: process.env.MAIL_USERNAME,
services/stockix-finance/packages/server/src/common/config/mail.ts:6:  password: process.env.MAIL_PASSWORD,
services/stockix-finance/packages/server/src/common/config/mail.ts:7:  port: parseInt(process.env.MAIL_PORT, 10),
services/stockix-finance/packages/server/src/common/config/mail.ts:8:  secure: process.env.MAIL_SECURE === 'true',
services/stockix-finance/packages/server/src/common/config/mail.ts:10:    name: process.env.MAIL_FROM_NAME,
services/stockix-finance/packages/server/src/common/config/mail.ts:11:    address: process.env.MAIL_FROM_ADDRESS,
services/stockix-finance/packages/server/src/common/config/gotenberg.ts:4:  url: process.env.GOTENBERG_URL,
services/stockix-finance/packages/server/src/common/config/gotenberg.ts:5:  docsUrl: process.env.GOTENBERG_DOCS_URL,
services/stockix-finance/packages/server/src/common/config/app.ts:4:  baseUrl: process.env.BASE_URL,
services/stockix-finance/packages/server/src/common/config/bull-board.ts:5:  enabled: parseBoolean<boolean>(process.env.BULL_BOARD_ENABLED, false),
services/stockix-finance/packages/server/src/common/config/bull-board.ts:6:  username: process.env.BULL_BOARD_USERNAME,
services/stockix-finance/packages/server/src/common/config/bull-board.ts:7:  password: process.env.BULL_BOARD_PASSWORD,
services/stockix-finance/packages/server/src/common/config/signup-confirmation.ts:5:  enabled: parseBoolean<boolean>(process.env.SIGNUP_EMAIL_CONFIRMATION, false),
services/stockix-finance/packages/server/src/common/config/posthog.ts:4:  apiKey: process.env.POSTHOG_API_KEY,
services/stockix-finance/packages/server/src/common/config/posthog.ts:5:  host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
services/stockix-finance/packages/server/src/common/config/stripe-payment.ts:4:  secretKey: process.env.STRIPE_PAYMENT_SECRET_KEY,
services/stockix-finance/packages/server/src/common/config/stripe-payment.ts:5:  publishableKey: process.env.STRIPE_PAYMENT_PUBLISHABLE_KEY,
services/stockix-finance/packages/server/src/common/config/stripe-payment.ts:6:  clientId: process.env.STRIPE_PAYMENT_CLIENT_ID,
services/stockix-finance/packages/server/src/common/config/stripe-payment.ts:7:  webhooksSecret: process.env.STRIPE_PAYMENT_WEBHOOKS_SECRET,
services/stockix-finance/packages/server/src/common/config/stripe-payment.ts:8:  redirectUrl: process.env.STRIPE_PAYMENT_REDIRECT_URL,
services/stockix-finance/packages/server/src/common/config/bankfeed.ts:5:    process.env.BANK_FEED_ENABLED === 'true' ||
services/stockix-finance/packages/server/src/common/config/bankfeed.ts:6:    process.env.BANK_FEED_ENABLED === 'yes',
services/stockix-finance/packages/server/src/common/config/inventory.ts:4:  scheduleComputeItemCost: process.env.INVENTORY_SCHEDULE_COMPUTE_ITEM_COST,
services/stockix-finance/packages/server/src/common/config/lemonsqueezy.ts:4:  apiKey: process.env.LEMONSQUEEZY_API_KEY,
services/stockix-finance/packages/server/src/common/config/lemonsqueezy.ts:5:  storeId: process.env.LEMONSQUEEZY_STORE_ID,
services/stockix-finance/packages/server/src/common/config/lemonsqueezy.ts:6:  webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
services/stockix-finance/packages/server/src/common/config/loops.ts:5:  apiKey: process.env.LOOPS_API_KEY,
services/stockix-finance/packages/server/src/common/config/cloud.ts:4:  hostedOnCloud: process.env.HOSTED_ON_BIGCAPITAL_CLOUD === 'true',
services/stockix-finance/packages/server/src/common/config/s3.ts:4:  region: process.env.S3_REGION || 'US',
services/stockix-finance/packages/server/src/common/config/s3.ts:5:  accessKeyId: process.env.S3_ACCESS_KEY_ID,
services/stockix-finance/packages/server/src/common/config/s3.ts:6:  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
services/stockix-finance/packages/server/src/common/config/s3.ts:7:  endpoint: process.env.S3_ENDPOINT,
services/stockix-finance/packages/server/src/common/config/s3.ts:8:  bucket: process.env.S3_BUCKET,
services/stockix-finance/packages/server/src/common/config/s3.ts:9:  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
services/stockix-finance/packages/server/src/common/config/jwt.ts:6:  const secret = process.env.APP_JWT_SECRET || process.env.JWT_SECRET;
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:23:  host: process.env.TENANT_DB_HOST || process.env.DB_HOST,
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:24:  port: process.env.TENANT_DB_PORT || process.env.DB_PORT || 6033,
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:25:  user: process.env.TENANT_DB_USER || process.env.DB_USER,
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:26:  password: process.env.TENANT_DB_PASSWORD || process.env.DB_PASSWORD,
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:28:    process.env.TENANT_DB_NAME_PREFIX
services/stockix-finance/packages/server/src/common/config/tenant-database.ts:29:    || process.env.TENANT_DB_NAME_PERFIX
services/stockix-finance/packages/server/src/common/config/signup-restrictions.ts:7:  disabled: parseBoolean<boolean>(process.env.SIGNUP_DISABLED, true),
services/stockix-finance/packages/server/src/common/config/signup-restrictions.ts:9:    process.env.SIGNUP_ALLOWED_DOMAINS,
services/stockix-finance/packages/server/src/common/config/signup-restrictions.ts:11:  allowedEmails: castCommaListEnvVarToArray(process.env.SIGNUP_ALLOWED_EMAILS),
services/stockix-finance/packages/server/src/common/config/queue.ts:4:  const host = process.env.QUEUE_HOST || process.env.REDIS_HOST || (process.env.NODE_ENV === 'production' ? '' : 'localhost');
services/stockix-finance/packages/server/src/common/config/queue.ts:10:    port: parseInt(process.env.QUEUE_PORT ?? process.env.REDIS_PORT ?? '', 10) || 6379,
services/stockix-finance/packages/server/src/common/config/queue.ts:11:    password: process.env.QUEUE_PASSWORD || process.env.REDIS_PASSWORD || undefined,
services/stockix-finance/packages/server/src/common/config/queue.ts:12:    db: parseInt(process.env.REDIS_DB ?? '', 10) || 0,
services/stockix-finance/packages/server/src/common/config/open-exchange.ts:4:  appId: process.env.OPEN_EXCHANGE_RATE_APP_ID,
services/stockix-finance/packages/server/src/common/config/plaid.ts:4:  env: process.env.PLAID_ENV || 'sandbox',
services/stockix-finance/packages/server/src/common/config/plaid.ts:5:  clientId: process.env.PLAID_CLIENT_ID,
services/stockix-finance/packages/server/src/common/config/plaid.ts:6:  secret: process.env.PLAID_SECRET,
services/stockix-finance/packages/server/src/common/config/plaid.ts:7:  linkWebhook: process.env.PLAID_LINK_WEBHOOK,
services/stockix-finance/packages/server/src/common/config/redis.ts:4:  const host = process.env.REDIS_HOST;
services/stockix-finance/packages/server/src/common/config/redis.ts:10:    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
services/stockix-finance/packages/server/src/common/config/redis.ts:11:    password: process.env.REDIS_PASSWORD || undefined,
services/stockix-finance/packages/server/src/common/config/redis.ts:12:    db: parseInt(process.env.REDIS_DB, 10) || 0,
services/stockix-finance/packages/server/src/common/config/system-database.ts:5:  host: process.env.SYSTEM_DB_HOST || process.env.DB_HOST,
services/stockix-finance/packages/server/src/common/config/system-database.ts:6:  port: process.env.SYSTEM_DB_PORT || process.env.DB_PORT || 6033,
services/stockix-finance/packages/server/src/common/config/system-database.ts:7:  user: process.env.SYSTEM_DB_USER || process.env.DB_USER,
services/stockix-finance/packages/server/src/common/config/system-database.ts:8:  password: process.env.SYSTEM_DB_PASSWORD || process.env.DB_PASSWORD,
services/stockix-finance/packages/server/src/common/config/system-database.ts:9:  databaseName: process.env.SYSTEM_DB_NAME || process.env.DB_NAME,
services/stockix-finance/packages/server/src/common/config/system-database.ts:10:  migrationDir: process.env.SYSTEM_DB_MIGRATION_DIR || './src/database/system/migrations',
services/stockix-finance/packages/server/src/common/config/system-database.ts:11:  seedsDir: process.env.SYSTEM_DB_SEEDS_DIR || './src/database/system/seeds',
```
### Directory: infra/worker-service/src/
```text
infra/worker-service/src/cron/orphan-cleanup.ts:32:  const db = createDb(process.env.DATABASE_URL!);
infra/worker-service/src/worker.ts:95:  parseInt(process.env.PROVISION_POLL_MS ?? String(apiConfig.provisionPollMs), 10) || apiConfig.provisionPollMs,
infra/worker-service/src/module-stacks.ts:792:        DATABASE_URL: process.env.DATABASE_URL ?? "",
infra/worker-service/src/chatwoot-provision.test.ts:8:    delete process.env.CHATWOOT_API_URL;
infra/worker-service/src/chatwoot-provision.test.ts:9:    delete process.env.CHATWOOT_SUPER_ADMIN_EMAIL;
infra/worker-service/src/chatwoot-provision.test.ts:10:    delete process.env.CHATWOOT_SUPER_ADMIN_PASSWORD;
infra/worker-service/src/chatwoot-provision.test.ts:14:    process.env.CHATWOOT_API_URL = "http://chatwoot:3000";
infra/worker-service/src/chatwoot-provision.test.ts:17:    process.env.CHATWOOT_SUPER_ADMIN_EMAIL = "admin@example.com";
infra/worker-service/src/chatwoot-provision.test.ts:20:    process.env.CHATWOOT_SUPER_ADMIN_PASSWORD = "password";
infra/worker-service/src/module-stacks.pos-compose.test.ts:23:    process.env.NODE_ENV = "test";
infra/worker-service/src/module-stacks.pos-compose.test.ts:24:    process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-min-32-chars!!";
infra/worker-service/src/module-stacks.pos-compose.test.ts:25:    process.env.LICENSE_SIGNING_SECRET = "test-license-signing-secret-min-32!!";
infra/worker-service/src/module-stacks.pos-compose.test.ts:26:    process.env.PLATFORM_JWT_SECRET = "test-platform-jwt-secret-min-32-chars!";
infra/worker-service/src/module-stacks.pos-compose.test.ts:27:    process.env.FIELD_ENCRYPTION_KEY = "dGVzdC1maWVsZC1lbmNyeXB0aW9uLWtleQ==";
infra/worker-service/src/module-stacks.pos-compose.test.ts:51:    delete process.env.RESEND_API_KEY;
infra/worker-service/src/module-stacks.pos-compose.test.ts:52:    process.env.MAIL_PASSWORD = "smtp-password-should-not-be-used";
infra/worker-service/src/module-stacks.pos-compose.test.ts:57:    process.env.RESEND_API_KEY = " re_test_key ";
infra/worker-service/src/provisioning-workflows/utils.ts:60:    ?? (process.platform === "win32" || process.env.NODE_ENV !== "production");
infra/worker-service/src/provisioning-workflows/utils.ts:65:  const workerNetwork = process.env.WORKER_INTERNAL_NETWORK ?? "stockix_internal";
infra/worker-service/src/add-accounting-module-runtime.ts:74:  const internalUrl = `http://${process.env.STOCKIX_FINANCE_INTERNAL_HOST ?? "127.0.0.1"}:${financeInternalPort}`;
infra/worker-service/src/add-accounting-module-runtime.ts:122:    const posHostPort = Number(process.env.POS_HOST_PORT ?? 8010);
```
### Directory: infra/worker-service/domain/
```text
infra/worker-service/domain/provisioner.proxysql-sync.test.ts:28:    process.env.WORKER_SHARED_MYSQL_HOST = "127.0.0.1";
infra/worker-service/domain/provisioner.proxysql-sync.test.ts:29:    delete process.env.PROXYSQL_ADMIN_USER;
infra/worker-service/domain/provisioner.proxysql-sync.test.ts:30:    delete process.env.PROXYSQL_ADMIN_PASSWORD;
infra/worker-service/domain/provisioner.ts:53:  return process.env.WORKER_SHARED_MYSQL_HOST?.trim() || sharedMysqlHost();
infra/worker-service/domain/provisioner.ts:57:  return process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
infra/worker-service/domain/provisioner.ts:65:  if (process.env.WORKER_SHARED_MYSQL_HOST?.trim() === "127.0.0.1") {
infra/worker-service/domain/provisioner.ts:91:    process.env.PROXYSQL_ADMIN_PASSWORD ??
infra/worker-service/domain/provisioner.ts:95:    process.env.PROXYSQL_ADMIN_USER ??
infra/worker-service/domain/provisioner.ts:250:  return process.env.WORKER_SHARED_MONGO_HOST?.trim() || sharedMongoHost();
infra/worker-service/domain/provisioner.ts:295:  const redisPassword = process.env.TENANT_REDIS_PASSWORD?.trim();
infra/worker-service/domain/provisioner.ts:636:  return Boolean(process.env.DOCKER_HOST?.trim());
infra/worker-service/domain/provisioner.ts:643:  const isProduction = process.env.NODE_ENV === "production";
infra/worker-service/domain/provisioner.ts:645:  if (onHost && !process.env.WORKER_SHARED_MYSQL_HOST?.trim()) {
infra/worker-service/domain/provisioning/build-finance-internal-url.ts:13:  const template = process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE?.trim();
infra/worker-service/domain/provisioning/build-finance-internal-url.ts:22:    process.env.POS_FINANCE_USE_TRAEFIK_URL === "1"
infra/worker-service/domain/provisioning/build-finance-internal-url.ts:23:    || process.env.POS_FINANCE_USE_TRAEFIK_URL === "true";
infra/worker-service/domain/provisioning/build-finance-internal-url.ts:35:  const fromEnv = process.env.POS_FINANCE_INTERNAL_HOST?.trim();
infra/worker-service/domain/provisioning/tenant-env.ts:74:  return process.env.MYSQL_PROXY_HOST ?? "stockix-mysql-proxy";
infra/worker-service/domain/provisioning/tenant-env.ts:114:  const password = process.env.TENANT_REDIS_PASSWORD?.trim();
infra/worker-service/domain/provisioning/tenant-env.ts:175:  const redisPassword = process.env.TENANT_REDIS_PASSWORD?.trim() ?? "";
infra/worker-service/domain/provisioning/tenant-env.ts:281:    GOTENBERG_URL: process.env.GOTENBERG_URL ?? "http://stockix-gotenberg:3000",
infra/worker-service/domain/provisioning/tenant-env.ts:283:    GOTENBERG_DOCS_URL: process.env.GOTENBERG_DOCS_URL ?? "http://server:3000/public/",
infra/worker-service/domain/provisioning/tenant-env.ts:286:    SENTRY_DSN: process.env.SENTRY_DSN?.trim() ?? "",
infra/worker-service/domain/provisioning/ensure-tenant-networks.test.ts:12:  const originalEnv = process.env.NODE_ENV;
infra/worker-service/domain/provisioning/ensure-tenant-networks.test.ts:19:    process.env.NODE_ENV = originalEnv;
infra/worker-service/domain/provisioning/ensure-tenant-networks.test.ts:23:    process.env.NODE_ENV = "development";
infra/worker-service/domain/provisioning/ensure-tenant-networks.test.ts:39:    process.env.NODE_ENV = "production";
infra/worker-service/domain/provisioning/provision-lock.ts:13:  const fromEnv = process.env.DATABASE_URL?.trim();
infra/worker-service/domain/provisioning/provision-lock.ts:68:  if (process.env.PROVISION_LOCK_DEBUG === "1") {
infra/worker-service/domain/provisioning/provision-lock.ts:87:    if (process.env.PROVISION_LOCK_DEBUG === "1") {
infra/worker-service/domain/provisioning/combined-org-pos-provision.ts:43:  const apiBase = `http://${process.env.API_HOST ?? "localhost"}:${apiConfig.port}`;
infra/worker-service/domain/provisioning/combined-org-pos-provision.ts:104:  const posHostPort = Number(process.env.POS_HOST_PORT ?? 8010);
infra/worker-service/domain/provisioning/ensure-tenant-networks.ts:22:  const isProduction = process.env.NODE_ENV === "production";
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:5:  const template = process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE?.trim();
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:7:    const host = process.env.POS_FINANCE_INTERNAL_HOST?.trim() || "host.docker.internal";
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:14:    process.env.POS_FINANCE_USE_TRAEFIK_URL === "1"
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:15:    || process.env.POS_FINANCE_USE_TRAEFIK_URL === "true"
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:17:    const rootDomain = process.env.ROOT_DOMAIN || "example.com";
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:18:    const scheme = process.env.PUBLIC_BASE_URL_SCHEME || "https";
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:21:  const host = process.env.POS_FINANCE_INTERNAL_HOST?.trim() || "host.docker.internal";
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:26:  delete process.env.POS_FINANCE_INTERNAL_URL_TEMPLATE;
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:27:  delete process.env.POS_FINANCE_USE_TRAEFIK_URL;
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:28:  delete process.env.POS_FINANCE_INTERNAL_HOST;
infra/worker-service/domain/provisioning/build-finance-internal-url.node.test.cjs:33:  process.env.POS_FINANCE_INTERNAL_HOST = "172.17.0.1";
infra/worker-service/domain/provisioning/redis-key-prefix.test.ts:50:    process.env.REDIS_KEY_PREFIX = prefix;
infra/worker-service/domain/provisioning/redis-key-prefix.test.ts:70:    delete process.env.REDIS_KEY_PREFIX;
infra/worker-service/domain/provisioning/redis-key-prefix.test.ts:79:    delete process.env.REDIS_KEY_PREFIX;
infra/worker-service/domain/provisioning/redis-key-prefix.test.ts:114:    expect(appModule).toContain("prefix: process.env.REDIS_KEY_PREFIX");
infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts:46:const BOOTSTRAP_POLL_TIMEOUT_MS = Number(process.env.BOOTSTRAP_POLL_TIMEOUT_MS ?? 60_000);
infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts:49:  process.env.BOOTSTRAP_CREDENTIALS_WAIT_MS ?? 120_000,
infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts:51:const BOOTSTRAP_POLL_INTERVAL_MS = Number(process.env.BOOTSTRAP_POLL_INTERVAL_MS ?? 1_500);
infra/worker-service/domain/provisioning/adapters/bootstrap-pos-org.ts:58:  const port = input.posHostPort ?? Number(process.env.POS_HOST_PORT ?? 8010);
infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.test.ts:9:    if (!process.env.DEPLOYMENT_SECRET_KEY) {
infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.test.ts:10:      process.env.DEPLOYMENT_SECRET_KEY = randomBytes(32).toString("hex");
infra/worker-service/domain/provisioning/adapters/sync-finance-license.ts:41:  const flag = process.env.FINANCE_LICENSE_SYNC_OPTIONAL?.trim().toLowerCase();
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:27:  const mysqlHost = process.env.WORKER_SHARED_MYSQL_HOST?.trim()
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:28:    || process.env.SHARED_MYSQL_HOST
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:30:  const rootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:86:  const mysqlHost = process.env.WORKER_SHARED_MYSQL_HOST?.trim()
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:87:    || process.env.SHARED_MYSQL_HOST
infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts:89:  const rootPassword = process.env.SHARED_MYSQL_ROOT_PASSWORD ?? "";
infra/worker-service/domain/scrub-tenant-artifacts.ts:56:  const tenantEnvRoot = process.env.TENANT_ENV_ROOT?.trim() || "/opt/stockix/tenants";
infra/worker-service/domain/scrub-tenant-artifacts.ts:58:    process.env.TRAEFIK_DYNAMIC_DIR?.trim() || "/opt/stockix/traefik-dynamic";
```
## 2. Existing Config Helpers
```text
```
## 3. All .env Files

### File: ./infra/prod/.env
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
API_DOMAIN=***
STOCKIX_API_URL=***
SHARED_MYSQL_ROOT_PASSWORD=***
SHARED_MYSQL_HOST=***
SHARED_MONGO_HOST=***
MYSQL_PROXY_HOST=***
MYSQL_PROXY_PORT=***
TENANT_REDIS_HOST=***
TENANT_REDIS_PASSWORD=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
WORKER_CONCURRENCY=***
INTERNAL_API_SECRET=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
DEPLOYMENT_SECRET_KEY=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
ALLOW_BOOTSTRAP_LOGIN=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
DASHBOARD_URL=***
CORS_ORIGINS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
REPO_ROOT=***
STOCKIX_REPO=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
PLATFORM_JWT_SECRET=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
MONGODB_DATABASE_URL=***
BACKUP_ENCRYPTION_KEY=***
CONTROL_PLANE_REDIS_URL=***
RUN_BULLMQ_CONSUMERS=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
RESEND_WEBHOOK_SECRET=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
PORT=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
GRAFANA_ADMIN_PASSWORD=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_INSTALLATION_NAME=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
CORS_ALLOWED_ORIGINS=***
```
### File: ./infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
SHARED_MYSQL_ROOT_PASSWORD=***
SHARED_MYSQL_HOST=***
MYSQL_PROXY_HOST=***
MYSQL_PROXY_PORT=***
TENANT_REDIS_PASSWORD=***
SHARED_MONGO_HOST=***
TENANT_REDIS_HOST=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
WORKER_CONCURRENCY=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
BACKUP_MYSQL_CONTAINER=***
BACKUP_MONGO_CONTAINER=***
BACKUP_ENCRYPTION_KEY=***
ALLOW_BOOTSTRAP_LOGIN=***
ALERT_WEBHOOK_URL=***
HEALTH_MYSQL_CONTAINER=***
HEALTH_MONGO_CONTAINER=***
HEALTH_REDIS_CONTAINER=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
GRAFANA_ADMIN_PASSWORD=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./infra/dev/.env.full.example
```text
RESEND_API_KEY=***
API_IMAGE=***
DASHBOARD_IMAGE=***
```
### File: ./.env
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PROXYSQL_ADMIN_USER=***
PROXYSQL_ADMIN_PASSWORD=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
WORKER_CONCURRENCY=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
SHARED_MYSQL_ROOT_PASSWORD=***
SHARED_MYSQL_HOST=***
SHARED_MONGO_HOST=***
MYSQL_PROXY_HOST=***
MYSQL_PROXY_PORT=***
TENANT_REDIS_HOST=***
TENANT_REDIS_PASSWORD=***
WORKER_SHARED_MYSQL_HOST=***
WORKER_SHARED_MONGO_HOST=***
WORKER_MYSQL_PROXY_PORT=***
WORKER_INTERNAL_NETWORK=***
HEALTH_MYSQL_CONTAINER=***
HEALTH_MONGO_CONTAINER=***
HEALTH_REDIS_CONTAINER=***
BACKUP_MYSQL_CONTAINER=***
BACKUP_MONGO_CONTAINER=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
PLATFORM_JWT_SECRET=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
API_DOMAIN=***
CONTROL_PLANE_REDIS_URL=***
RUN_BULLMQ_CONSUMERS=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
MONGODB_URI=***
REDIS_URL=***
PUBLIC_APP_URL=***
LICENSE_ENFORCEMENT_MODE=***
POS_BACKEND_PORT=***
TENANT_ID=***
PLATFORM_IMPERSONATION_ENABLED=***
WORKER_HEALTH_PORT=***
```
### File: ./apps/pos-backend/.env.local
```text
NODE_ENV=***
REDIS_URL=***
```
### File: ./apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./apps/dashboard/.env.example
```text
```
### File: ./apps/api/.env.example
```text
```
### File: ./apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./services/pms/frontend/.env.local
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
CONTROL_PLANE_REDIS_URL=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
PLATFORM_JWT_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
SHARED_MYSQL_ROOT_PASSWORD=***
SHARED_MYSQL_HOST=***
SHARED_MONGO_HOST=***
MYSQL_PROXY_HOST=***
MYSQL_PROXY_PORT=***
TENANT_REDIS_HOST=***
TENANT_REDIS_PASSWORD=***
WORKER_CONCURRENCY=***
WORKER_SHARED_MYSQL_HOST=***
WORKER_SHARED_MONGO_HOST=***
PROXYSQL_ADMIN_USER=***
PROXYSQL_ADMIN_PASSWORD=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-a774dc62ac938ecea/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-a9496aa30896c2060/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-a1a3d39a7fd48d178/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-aaacc46c772525ff0/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-a8643e5780cb55460/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-aa2524a669e430f71/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-af94ccfcc56aba792/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/infra/prod/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
CORS_ORIGINS=***
SENTRY_DSN=***
NEXT_PUBLIC_SENTRY_DSN=***
SENTRY_ENVIRONMENT=***
SENTRY_ORG=***
SENTRY_PROJECT=***
RELEASE_VERSION=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
CONTROL_PLANE_REDIS_URL=***
BACKUP_B2_BUCKET=***
BACKUP_B2_KEY_ID=***
BACKUP_B2_APP_KEY=***
BACKUP_B2_ENDPOINT=***
BACKUP_B2_PREFIX=***
BACKUP_RETENTION_DAYS=***
BACKUP_POSTGRES_CONTAINER=***
ALLOW_BOOTSTRAP_LOGIN=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
DATABASE_URL=***
STOCKIX_REPO=***
REPO_ROOT=***
STOCKIX_TENANT_APP_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
MONGODB_DATABASE_URL=***
MAX_TENANT_PORT=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/infra/staging/.env.example
```text
NODE_ENV=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
DASHBOARD_URL=***
STOCKIX_API_URL=***
API_DOMAIN=***
BACKUP_B2_PREFIX=***
RUN_BULLMQ_CONSUMERS=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/apps/api/.env.example
```text
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/pms/frontend/.env.example
```text
NEXT_PUBLIC_PMS_API_URL=***
NEXT_PUBLIC_SESSION_COOKIE=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/pms/.env.example
```text
NODE_ENV=***
DATABASE_URL=***
AUTH_TOKEN_SECRET=***
PMS_PORT=***
CORS_ALLOWED_ORIGINS=***
INTERNAL_API_SECRET=***
PLATFORM_API_SECRET=***
PMS_ICAL_SYNC_INTERVAL_MS=***
GEMINI_API_KEY=***
MAIL_HOST=***
MAIL_PORT=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/chatlive/tests/playwright/.env.example
```text
BASE_URL=***
TEST_USER_EMAIL=***
TEST_USER_PASSWORD=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/chatlive/.env.example
```text
SECRET_KEY_BASE=***
FRONTEND_URL=***
ASSET_CDN_HOST=***
FORCE_SSL=***
ENABLE_ACCOUNT_SIGNUP=***
REDIS_URL=***
REDIS_PASSWORD=***
REDIS_SENTINELS=***
REDIS_SENTINEL_MASTER_NAME=***
POSTGRES_HOST=***
POSTGRES_USERNAME=***
POSTGRES_PASSWORD=***
RAILS_ENV=***
RAILS_MAX_THREADS=***
MAILER_SENDER_EMAIL=***
SMTP_DOMAIN=***
SMTP_ADDRESS=***
SMTP_PORT=***
SMTP_USERNAME=***
SMTP_PASSWORD=***
SMTP_AUTHENTICATION=***
SMTP_ENABLE_STARTTLS_AUTO=***
SMTP_OPENSSL_VERIFY_MODE=***
MAILER_INBOUND_EMAIL_DOMAIN=***
RAILS_INBOUND_EMAIL_SERVICE=***
RAILS_INBOUND_EMAIL_PASSWORD=***
MAILGUN_INGRESS_SIGNING_KEY=***
MANDRILL_INGRESS_API_KEY=***
ACTION_MAILBOX_SES_SNS_TOPIC=***
ACTIVE_STORAGE_SERVICE=***
S3_BUCKET_NAME=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
AWS_REGION=***
RAILS_LOG_TO_STDOUT=***
LOG_LEVEL=***
LOG_SIZE=***
FB_VERIFY_TOKEN=***
FB_APP_SECRET=***
FB_APP_ID=***
IG_VERIFY_TOKEN=***
TWITTER_APP_ID=***
TWITTER_CONSUMER_KEY=***
TWITTER_CONSUMER_SECRET=***
TWITTER_ENVIRONMENT=***
SLACK_CLIENT_ID=***
SLACK_CLIENT_SECRET=***
GOOGLE_OAUTH_CLIENT_ID=***
GOOGLE_OAUTH_CLIENT_SECRET=***
GOOGLE_OAUTH_CALLBACK_URL=***
IOS_APP_ID=***
ANDROID_BUNDLE_ID=***
ANDROID_SHA256_CERT_FINGERPRINT=***
ENABLE_PUSH_RELAY_SERVER=***
STRIPE_SECRET_KEY=***
STRIPE_WEBHOOK_SECRET=***
DIRECT_UPLOADS_ENABLED=***
AZURE_APP_ID=***
AZURE_APP_SECRET=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/stockix-finance/packages/server/.env.example
```text
PORT=***
BASE_URL=***
SOCKET_ALLOWED_ORIGINS=***
APP_JWT_SECRET=***
INTERNAL_API_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
GOTENBERG_HOST_PORT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
BULL_BOARD_ENABLED=***
BULL_BOARD_USERNAME=***
BULL_BOARD_PASSWORD=***
BANK_FEED_ENABLED=***
HOSTED_ON_BIGCAPITAL_CLOUD=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/stockix-finance/packages/webapp/.env.example
```text
REACT_APP_VERSION=***
TSC_COMPILE_ON_ERROR=***
ESLINT_NO_DEV_ERRORS=***
REACT_APP_STOCKIX_API_URL=***
REACT_APP_STOCKIX_DISCOVERY_SLUG=***
REACT_APP_STOCKIX_TENANT_ID=***
VITE_STOCKIX_LOGO_URL=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/stockix-finance/.env.example
```text
APP_JWT_SECRET=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_ROOT_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_NAME=***
TENANT_DB_NAME_PERFIX=***
BASE_URL=***
JWT_SECRET=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
SIGNUP_EMAIL_CONFIRMATION=***
API_RATE_LIMIT=***
GOTENBERG_URL=***
GOTENBERG_DOCS_URL=***
EXCHANGE_RATE_SERVICE=***
OPEN_EXCHANGE_RATE_APP_ID=***
PLAID_ENV=***
PLAID_CLIENT_ID=***
PLAID_SECRET=***
PLAID_LINK_WEBHOOK=***
LEMONSQUEEZY_API_KEY=***
LEMONSQUEEZY_STORE_ID=***
LEMONSQUEEZY_WEBHOOK_SECRET=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_ENDPOINT=***
S3_BUCKET=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
STRIPE_PAYMENT_SECRET_KEY=***
STRIPE_PAYMENT_PUBLISHABLE_KEY=***
STRIPE_PAYMENT_CLIENT_ID=***
STRIPE_PAYMENT_WEBHOOKS_SECRET=***
STRIPE_PAYMENT_REDIRECT_URL=***
REDIS_HOST=***
REDIS_PORT=***
REDIS_PASSWORD=***
REDIS_DB=***
QUEUE_HOST=***
QUEUE_PORT=***
FINANCE_PROVISION_SECRET=***
FINANCE_PROVISION_PASSWORD=***
SOCKET_ALLOWED_ORIGINS=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/posnew/apps/pos-backend/.env.example
```text
PORT=***
NODE_ENV=***
PUBLIC_APP_URL=***
MONGODB_URI=***
AUTH_TOKEN_SECRET=***
POS_PLATFORM_API_KEY=***
JWT_SECRET=***
BOOTSTRAP_ADMIN_PIN=***
BOOTSTRAP_ADMIN_NAME=***
RAZORPAY_KEY_ID=***
RAZORPAY_KEY_SECRET=***
RAZORPAY_WEBHOOK_SECRET=***
PLATFORM_JWT_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/services/posnew/apps/pos-frontend2/.env.example
```text
NEXT_PUBLIC_POS_API_ORIGIN=***
```
### File: ./.claude/worktrees/agent-a0778551d56d9ebd8/.env.example
```text
NODE_ENV=***
HOSTNAME=***
DATABASE_URL=***
DB_WAIT_TIMEOUT_MS=***
DB_CLIENT=***
DB_HOST=***
DB_USER=***
DB_PASSWORD=***
DB_CHARSET=***
SYSTEM_DB_CLIENT=***
SYSTEM_DB_HOST=***
SYSTEM_DB_USER=***
SYSTEM_DB_PASSWORD=***
SYSTEM_DB_NAME=***
SYSTEM_DB_CHARSET=***
TENANT_DB_CLIENT=***
TENANT_DB_NAME_PREFIX=***
TENANT_DB_NAME_PERFIX=***
TENANT_DB_HOST=***
TENANT_DB_USER=***
TENANT_DB_PASSWORD=***
TENANT_DB_CHARSET=***
PORT=***
PLATFORM_API_SECRET=***
WORKER_SECRET=***
INTERNAL_API_SECRET=***
DASHBOARD_URL=***
ROOT_DOMAIN=***
PUBLIC_BASE_URL_SCHEME=***
MAX_TENANT_PORT=***
STOCKIX_TENANT_APP_ROOT=***
REPO_ROOT=***
TENANT_ENV_ROOT=***
TRAEFIK_DYNAMIC_DIR=***
TRAEFIK_TENANT_UPSTREAM_HOST=***
TENANT_INTERNAL_HOST=***
CORS_ORIGINS=***
CORS_ALLOWED_ORIGINS=***
SENTRY_DSN=***
DB_POOL_MAX=***
DB_IDLE_TIMEOUT_SECONDS=***
DB_CONNECT_TIMEOUT_SECONDS=***
DB_MAX_LIFETIME_SECONDS=***
STOCKIX_API_URL=***
PROVISION_POLL_MS=***
PROVISION_MAX_MS=***
OWNER_ID=***
PROVISION_ADMIN_EMAIL=***
WORKER_JOB_ID=***
WORKER_JOB_EXECUTION_TIMEOUT_MS=***
WORKER_STARTUP_GRACE_MS=***
WORKER_HEARTBEAT_STALE_MS=***
WORKER_STALE_LEASE_THRESHOLD_MS=***
DOCKER_COMPOSE_UP_TIMEOUT_MS=***
DOCKER_COMPOSE_RUN_TIMEOUT_MS=***
DOCKER_COMPOSE_DEFAULT_TIMEOUT_MS=***
METRICS_ENDPOINT=***
METRICS_AUTH_TOKEN=***
SESSION_SECRET=***
AUTH_TOKEN_SECRET=***
LICENSE_SIGNING_SECRET=***
DEFAULT_LICENSE_TERM_DAYS=***
ALLOW_BOOTSTRAP_LOGIN=***
BOOTSTRAP_ADMIN_EMAIL=***
BOOTSTRAP_ADMIN_PASSWORD=***
PLATFORM_ADMIN_EMAIL=***
PLATFORM_ADMIN_PASSWORD=***
DEPLOYMENT_SECRET_KEY=***
JWT_SECRET=***
SIGNUP_DISABLED=***
SIGNUP_ALLOWED_DOMAINS=***
SIGNUP_ALLOWED_EMAILS=***
NEXT_PUBLIC_STOCKIX_API_URL=***
NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME=***
NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN=***
NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST=***
SECURITY_HSTS=***
SECURITY_X_FRAME_OPTIONS=***
SECURITY_REFERRER_POLICY=***
SECURITY_X_CONTENT_TYPE_OPTIONS=***
SECURITY_CSP_BASE=***
POSTGRES_USER=***
POSTGRES_PASSWORD=***
POSTGRES_DB=***
POSTGRES_HOST_PORT=***
ACME_EMAIL=***
CF_DNS_API_TOKEN=***
STOCKIX_REPO=***
BASE_URL=***
PUBLIC_PROXY_PORT=***
PUBLIC_PROXY_SSL_PORT=***
MONGODB_DATABASE_URL=***
MAIL_HOST=***
MAIL_USERNAME=***
MAIL_PASSWORD=***
MAIL_PORT=***
MAIL_SECURE=***
MAIL_FROM_NAME=***
MAIL_FROM_ADDRESS=***
RESEND_WEBHOOK_SECRET=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=***
AGENDASH_AUTH_USER=***
AGENDASH_AUTH_PASSWORD=***
AGENDA_DB_COLLECTION=***
AGENDA_POOL_TIME=***
AGENDA_CONCURRENCY=***
EASY_SMS_TOKEN=***
THROTTLE_GLOBAL_TTL=***
THROTTLE_GLOBAL_LIMIT=***
THROTTLE_AUTH_TTL=***
THROTTLE_AUTH_LIMIT=***
PLAYWRIGHT_TEST_BASE_URL=***
SMOKE_OWNER_ID=***
BROWSER_WS_ENDPOINT=***
PUBLIC_URL=***
npm_package_json=***
npm_package_type=***
MONOREPO_VERSION=***
S3_REGION=***
S3_ACCESS_KEY_ID=***
S3_SECRET_ACCESS_KEY=***
S3_BUCKET=***
S3_ENDPOINT=***
S3_FORCE_PATH_STYLE=***
POSTHOG_API_KEY=***
POSTHOG_HOST=***
POS_PLATFORM_BASE_URL=***
POS_PLATFORM_API_KEY=***
POS_FINANCE_INTERNAL_HOST=***
STOCKIX_FINANCE_INTERNAL_HOST=***
POS_HOST_PORT=***
POS_FRONTEND_HOST_PORT=***
POS_FRONTEND_URL=***
PMS_PORT=***
PMS_BASE_URL=***
NEXT_PUBLIC_PMS_API_URL=***
PMS_APP_ROOT=***
POS_APP_ROOT=***
CHATWOOT_BASE_URL=***
CHATWOOT_API_ACCESS_TOKEN=***
CHATWOOT_SECRET_KEY_BASE=***
CHATWOOT_DB_PASSWORD=***
CHATWOOT_FRONTEND_URL=***
CHATWOOT_INSTALLATION_NAME=***
CHATWOOT_BRAND_NAME=***
CHATWOOT_BRAND_URL=***
CHATWOOT_WIDGET_BRAND_URL=***
CHATWOOT_LOGO_URL=***
CHATWOOT_LOGO_DARK_URL=***
CHATWOOT_LOGO_THUMBNAIL_URL=***
CHATWOOT_DISPLAY_MANIFEST=***
CHATWOOT_HELPCENTER_URL=***
PROVISION_MODULE_GATING=***
GEMINI_API_KEY=***
PMS_ICAL_SYNC_INTERVAL_MS=***
```
## 4. dotenv Imports
```text
```
## 6. Fallback Patterns — Real Scan
### Fallbacks in: apps/api/src/
```text
```
### Fallbacks in: apps/pos-backend/
```text
```
### Fallbacks in: services/pms/src/
```text
```
### Fallbacks in: services/stockix-finance/packages/server/src/
```text
```
### Fallbacks in: infra/worker-service/src/
```text
```
### Fallbacks in: infra/worker-service/domain/
```text
```

## 5. Boot Validation — Read the Actual Entry Points

### apps/api/src/index.ts
- Validation mechanism: None at boot. It relies on `@repo/config` exporting `apiConfig`.
- Only checks `if (apiConfig.nodeEnv === "production")` and waits for Redis. Missing `PLATFORM_JWT_SECRET` does not explicitly crash it at boot unless `apiConfig` throws.

### apps/pos-backend/app.js
- Validation mechanism: Custom manual checks.
- Code: `if (!config.accessTokenSecret || !config.refreshTokenSecret) { logger.error(...); process.exit(1); }`
- Code: `if (config.nodeEnv === "production" && !process.env.PLATFORM_JWT_SECRET) { ... process.exit(1); }`
- No centralized schema validation.

### services/pms/src/server.ts
- Validation mechanism: None at boot.
- It logs a warning if `dbConfig.databaseUrl` is missing, but does not crash.

### services/stockix-finance/packages/server/src/main.ts
- Validation mechanism: None at boot.
- Mostly falls back to defaults or logs warnings: `process.env.NODE_ENV ?? 'production'`, `process.env.PORT ?? 3000`. No explicit required check that crashes the app.

### infra/worker-service/src/worker.ts
- Validation mechanism: Checks `apiConfig.sentryDsn` and logs a warning if missing. Zod is used for payload validation (e.g. `provisionPayloadSchema`), but not for boot environment variables.

## 7. Env Vars Per Service in Compose Files

### infra/prod/docker-compose.yml
**Service: traefik**
- CF_DNS_API_TOKEN: `${CF_DNS_API_TOKEN}` (reference)

**Service: postgres**
- POSTGRES_USER: `postgres` (hardcoded)
- POSTGRES_PASSWORD: `${POSTGRES_PASSWORD}` (reference)
- POSTGRES_DB: `stockix_platform` (hardcoded)

**Service: pgbouncer**
- DATABASES_HOST: `postgres` (hardcoded)
- DATABASES_PASSWORD: `${POSTGRES_PASSWORD}` (reference)
... and others hardcoded.

**Service: api**
- Uses `*stockix-platform-env` anchor which injects ~35 platform variables (SENTRY_DSN, ROOT_DOMAIN, CONTROL_PLANE_REDIS_URL, etc) all via references like `${VAR}` or `${VAR:-default}`.
- DATABASE_URL: `postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform` (hybrid)
- PORT: `"4000"` (hardcoded)
- RUN_BULLMQ_CONSUMERS: `"false"` (hardcoded)

**Service: infra-worker**
- Uses `*stockix-worker-env` anchor which extends platform-env and injects worker specific vars (API_HOST, REPO_ROOT, TENANT_ENV_ROOT, etc) via references like `${VAR:-default}`.
- DATABASE_URL: `postgresql://postgres:${POSTGRES_PASSWORD}@pgbouncer:5432/stockix_platform` (hybrid)

### infra/tenant-stack/docker-compose.yml
**Service: server (Finance)**
- NODE_ENV: `production` (hardcoded)
- SENTRY_DSN: `${SENTRY_DSN:-}` (reference)
- DB_HOST: `${DB_HOST:-stockix-mysql-proxy}` (reference)
- DB_USER: `${DB_USER}` (reference)
- DB_PASSWORD: `${DB_PASSWORD}` (reference)
- REDIS_HOST: `${TENANT_REDIS_HOST:-stockix-redis}` (reference)
- JWT_SECRET: `${JWT_SECRET}` (reference)
- BASE_URL: `${BASE_URL}` (reference)
- REACT_APP_STOCKIX_API_URL: `${REACT_APP_STOCKIX_API_URL:-}` (reference)
*(Over 50 variables mapped via references for DB, S3, Auth, Branding)*

### infra/pos-tenant-stack/docker-compose.yml
- Contains `pos-backend` with similar explicit mapping from `.env` overrides:
- MONGODB_URI: `${MONGODB_URI}`
- REDIS_URL: `${REDIS_URL}`
- JWT_SECRET: `${JWT_SECRET}`
- PLATFORM_JWT_SECRET: `${PLATFORM_JWT_SECRET}`
- PORT: `"8010"` (hardcoded)

### infra/pms-tenant-stack/docker-compose.yml
- Contains `pms-backend` explicitly mapped:
- PMS_PORT: `"3003"` (hardcoded)
- DATABASE_URL: `${PMS_DATABASE_URL}` (reference)
- PMS_JWT_SECRET: `${PMS_JWT_SECRET}` (reference)

## 8. Summary Table

| Metric | Count / Status | Notes |
| :--- | :--- | :--- |
| **Direct `process.env` references** | > 1,500+ | Pervasive across all codebases, especially in POS, Finance, and Worker. |
| **Inline fallbacks (`??` or `\|\|`)** | > 500+ | Very common in POS app.js, Worker tenant provisioning, Finance config. |
| **`requireEnv` helper uses** | ~20 | Used sparsely in shared packages, but not universally adopted. |
| **`dotenv` or `.config()` calls** | ~50 | Present in many scripts, entry points, and test files. |
| **Services with Zod boot validation** | 0 | No service currently validates its entire process.env at boot using Zod. |
| **`.env` files checked in repo** | Multiple | Examples, test envs, and some local overrides exist. No secrets committed. |

