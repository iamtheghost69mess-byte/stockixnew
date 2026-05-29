import { createHmac } from "node:crypto";

const STXI_PREFIX = "STXI";

export function isLegacyStkxKey(key: string): boolean {
  return /^STKX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key.trim());
}

export function isStxiLicenseKey(key: string): boolean {
  return key.trim().toUpperCase().startsWith(`${STXI_PREFIX}-`);
}

/** Stable short code from tenant UUID (first 6 hex chars, uppercase). */
export function tenantShortFromId(tenantId: string): string {
  return tenantId.replace(/-/g, "").toUpperCase().slice(0, 6);
}

/** Stable short code from POS location id (last 6 alphanumeric, min width 4). */
export function locationShortFromId(locationId: string): string {
  const raw = locationId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length <= 6) return raw.padStart(4, "0");
  return raw.slice(-6);
}

function checksumForPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 6).toUpperCase();
}

export function generateStxiLicenseKey(opts: {
  tenantId: string;
  locationId: string;
  secret: string;
}): string {
  const tenantShort = tenantShortFromId(opts.tenantId);
  const locationShort = locationShortFromId(opts.locationId);
  const payload = `${tenantShort}:${locationShort}`;
  const checksum = checksumForPayload(payload, opts.secret);
  return `${STXI_PREFIX}-${tenantShort}-${locationShort}-${checksum}`;
}

export type ParsedStxiLicenseKey = {
  tenantShort: string;
  locationShort: string;
  checksum: string;
};

export function parseStxiLicenseKey(key: string): ParsedStxiLicenseKey | null {
  const normalized = key.trim().toUpperCase();
  const parts = normalized.split("-");
  if (parts.length !== 4 || parts[0] !== STXI_PREFIX) return null;
  const tenantShort = parts[1]!;
  const locationShort = parts[2]!;
  const checksum = parts[3]!;
  if (!/^[A-Z0-9]{4,6}$/.test(tenantShort)) return null;
  if (!/^[A-Z0-9]{4,6}$/.test(locationShort)) return null;
  if (!/^[A-Z0-9]{6}$/.test(checksum)) return null;
  return { tenantShort, locationShort, checksum };
}

export function validateStxiLicenseKey(
  key: string,
  opts: { tenantId: string; locationId: string; secret: string },
): boolean {
  const parsed = parseStxiLicenseKey(key);
  if (!parsed) return false;
  const tenantShort = tenantShortFromId(opts.tenantId);
  const locationShort = locationShortFromId(opts.locationId);
  if (parsed.tenantShort !== tenantShort || parsed.locationShort !== locationShort) {
    return false;
  }
  const expected = checksumForPayload(`${tenantShort}:${locationShort}`, opts.secret);
  return parsed.checksum === expected;
}

/** Returns true if key is accepted (STXI valid or legacy STKX when allowed). */
export function acceptLicenseKeyFormat(
  key: string,
  opts: {
    tenantId: string;
    locationId: string;
    secret: string;
    acceptStkxUntil?: Date | null;
    now?: Date;
  },
): boolean {
  if (isStxiLicenseKey(key)) {
    return validateStxiLicenseKey(key, opts);
  }
  if (isLegacyStkxKey(key)) {
    if (!opts.acceptStkxUntil) return true;
    const now = opts.now ?? new Date();
    return now.getTime() <= opts.acceptStkxUntil.getTime();
  }
  return false;
}
