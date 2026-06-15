import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const sendMailMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "test-id" }),
);
const getActiveLicenseForTenantMock = vi.hoisted(() => vi.fn());

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
}));

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    getActiveLicenseForTenant: getActiveLicenseForTenantMock,
  };
});

import {
  sendLicenseExpiredEmailForTenant,
  sendLicenseExpiringEmailForTenant,
} from "../src/mail/send.js";

const tenantId = "tenant-11111111-1111-1111-1111-111111111111";

function createTenantSelectMock(
  rows: Array<{ name: string; adminEmail: string | null }>,
) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as PostgresJsDatabase<typeof schema>;
}

describe("License expiry email", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    getActiveLicenseForTenantMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends expired email when license expires", async () => {
    const expiredAt = new Date("2026-05-01T00:00:00.000Z");
    const db = createTenantSelectMock([
      { name: "Acme Corp", adminEmail: "admin@acme.test" },
    ]);
    getActiveLicenseForTenantMock.mockResolvedValue({
      expiresAt: expiredAt,
      gracePeriodDays: 7,
    });

    await sendLicenseExpiredEmailForTenant(db, tenantId);

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@acme.test",
        subject: "Your Stockix license has expired",
      }),
    );
    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain("Acme Corp");
    expect(html).toContain("read-only");
  });

  it("does not throw when tenant has no admin email", async () => {
    const db = createTenantSelectMock([
      { name: "No Email Tenant", adminEmail: null },
    ]);

    await expect(
      sendLicenseExpiredEmailForTenant(db, tenantId),
    ).resolves.toBeUndefined();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[sendLicenseExpiredEmail] No admin email for tenant",
      tenantId,
    );
  });

  it("does not throw when tenant not found", async () => {
    const db = createTenantSelectMock([]);

    await expect(
      sendLicenseExpiredEmailForTenant(db, tenantId),
    ).resolves.toBeUndefined();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[sendLicenseExpiredEmail] Tenant not found:",
      tenantId,
    );
  });

  it("sends expiring-soon email with correct days remaining", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T12:00:00.000Z"));

    const expiresAt = new Date("2026-05-22T12:00:00.000Z");
    const db = createTenantSelectMock([
      { name: "Soon Corp", adminEmail: "soon@corp.test" },
    ]);

    await sendLicenseExpiringEmailForTenant(db, tenantId, {
      expiresAt,
      gracePeriodDays: 7,
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    const html = sendMailMock.mock.calls[0][0].html as string;
    expect(html).toContain("5 days");
    expect(html).toContain("Soon Corp");

    vi.useRealTimers();
  });

  it("uses correct idempotency key format for expired email", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T15:00:00.000Z"));

    const expiredAt = new Date("2026-05-01T00:00:00.000Z");
    const db = createTenantSelectMock([
      { name: "Key Corp", adminEmail: "key@corp.test" },
    ]);
    getActiveLicenseForTenantMock.mockResolvedValue({
      expiresAt: expiredAt,
      gracePeriodDays: 7,
    });

    await sendLicenseExpiredEmailForTenant(db, tenantId);

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `license-expired/${tenantId}/2026-05-20`,
      }),
    );

    vi.useRealTimers();
  });

  it("uses correct idempotency key format for expiring-soon email", async () => {
    const expiresAt = new Date("2026-06-01T00:00:00.000Z");
    const db = createTenantSelectMock([
      { name: "Expiring Corp", adminEmail: "exp@corp.test" },
    ]);

    await sendLicenseExpiringEmailForTenant(db, tenantId, {
      expiresAt,
      gracePeriodDays: 7,
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `license-expiring/${tenantId}/2026-06-01`,
      }),
    );
  });

  it("uses milestone idempotency key when milestoneDays provided", async () => {
    const licenseId = "lic-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const expiresAt = new Date("2026-06-01T00:00:00.000Z");
    const db = createTenantSelectMock([
      { name: "Milestone Corp", adminEmail: "m@corp.test" },
    ]);

    await sendLicenseExpiringEmailForTenant(db, tenantId, {
      expiresAt,
      gracePeriodDays: 7,
      licenseId,
      milestoneDays: 7,
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `license-expiring/${licenseId}/7`,
      }),
    );
  });
});
