/**
 * Worker-facing exports for infra-worker and @repo/platform-worker-shared.
 * Keep this surface minimal — worker bundle imports from here via package export.
 */
export {
  getLicenseExpiry,
  getPlanLimits,
} from "./license-utils.js";

export { processLicenseExpiryFollowUp } from "./license-expire-followup.js";

export { syncFinanceLicenseForStockixTenant } from "./finance-license.client.js";

export { sendPosWelcomeEmail } from "./mail/send.js";

export { initEmailLogging } from "./mail/email-log.js";
