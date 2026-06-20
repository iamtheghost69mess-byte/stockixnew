// Central re-export barrel — consumers always import from "@repo/config".
// Internal implementation lives in the domain files imported below.
// Importing this file triggers env bootstrapping (dotenv loading) via env.ts.

export { env, validateWorkerSecret } from "./env.js";
export { apiConfig } from "./api.js";
export { dashboardConfig } from "./dashboard.js";
export { dbConfig } from "./db.js";
export { infraConfig } from "./infra.js";
export {
  mailConfig,
  isMailConfigured,
  getMailHealthStatus,
  getResendWebhookSecret,
} from "./mail.js";
export { posConfig } from "./pos.js";
export { pmsConfig } from "./pms.js";
export { chatwootConfig } from "./chatwoot.js";
export { moduleGatingConfig } from "./modules.js";
export { licenseConfig } from "./license.js";
