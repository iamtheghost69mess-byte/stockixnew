import { env } from "./env.js";

export const licenseConfig = {
  defaultTermDays: parseInt(process.env.DEFAULT_LICENSE_TERM_DAYS ?? "365", 10),
  /** When true, license sync failures return HTTP 502 instead of soft-failing. */
  get syncStrict() {
    return env.LICENSE_SYNC_STRICT === "1";
  },
} as const;
