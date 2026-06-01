import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const sendMailMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "test-id" }),
);

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
}));

vi.mock("../src/license-utils.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/license-utils.js")>();
  return {
    ...mod,
    insertLicenseHistory: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  sendLicenseActivatedEmail,
  sendLicenseActivatedEmailForTenant,
} from "../src/mail/send.js";

const tenantId = "tenant-11111111-1111-1111-1111-111111111111";
const licenseId = "lic-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function createDbMock(opts: {
  tenant?: { name: string; adminEmail: string | null; slug: string } | null;
  license?: {
    id: string;
    planSlug: string;
    modules: string;
    validFrom: Date;
    expiresAt: Date | null;
    isPerpetual: boolean;
    activatedAt: Date | null;
  } | null;
  planName?: string | null;
}) {
  let selectCall = 0;
  const limit = vi.fn().mockImplementation(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return Promise.resolve(opts.tenant ? [opts.tenant] : []);
    }
    if (selectCall === 2) {
      return Promise.resolve(opts.license ? [opts.license] : []);
    }
    return Promise.resolve(opts.planName ? [{ name: opts.planName }] : []);
  });
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select } as unknown as PostgresJsDatabase<typeof schema>;
}

describe("License activated email", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends license activated email with plan and module details", async () => {
    const validFrom = new Date("2026-05-01T00:00:00.000Z");
    const expiresAt = new Date("2027-05-01T00:00:00.000Z");

    await sendLicenseActivatedEmail({
      to: "admin@acme.test",
      tenantName: "Acme Corp",
      tenantId,
      planName: "Professional",
      modules: ["accounting", "pos"],
      validFrom,
      expiresAt,
      isPerpetual: false,
      loginUrl: "https://acme.stockix.app",
      licenseId,
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@acme.test",
        subject: "Your Stockix license is active",
        idempotencyKey: `license-activated/${licenseId}`,
        templateKey: "license-activated",
        tenantId,
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Professional");
    expect(html).toContain("Accounting, Point of Sale");
    expect(html).toContain("https://acme.stockix.app");
  });

  it("loads tenant and license data when sending for tenant", async () => {
    const validFrom = new Date("2026-05-01T00:00:00.000Z");
    const db = createDbMock({
      tenant: { name: "Acme Corp", adminEmail: "admin@acme.test", slug: "acme" },
      license: {
        id: licenseId,
        planSlug: "professional",
        modules: '["accounting"]',
        validFrom,
        expiresAt: null,
        isPerpetual: true,
        activatedAt: validFrom,
      },
      planName: "Professional",
    });

    await sendLicenseActivatedEmailForTenant(db, tenantId, { licenseId });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@acme.test",
        idempotencyKey: `license-activated/${licenseId}`,
        templateKey: "license-activated",
      }),
    );
  });

  it("does not send when tenant has no admin email", async () => {
    const db = createDbMock({
      tenant: { name: "No Email", adminEmail: null, slug: "no-email" },
    });

    await expect(
      sendLicenseActivatedEmailForTenant(db, tenantId, { licenseId }),
    ).resolves.toBeUndefined();

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[sendLicenseActivatedEmail] No admin email for tenant",
      tenantId,
    );
  });
});
