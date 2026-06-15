import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";

const sendExpiringMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "msg-tenant" }),
);
const sendExpiringOwnerMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "msg-owner" }),
);
const hasMilestoneMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const notifyMock = vi.hoisted(() => vi.fn());

vi.mock("../src/mail/send.js", () => ({
  sendLicenseExpiredEmailForTenant: vi.fn(),
  sendLicenseExpiringEmailForTenant: sendExpiringMock,
  sendLicenseExpiringEmailToPlatformOwner: sendExpiringOwnerMock,
}));

vi.mock("../src/notification-service.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/notification-service.js")>();
  return {
    ...mod,
    hasLicenseExpiryMilestoneNotification: hasMilestoneMock,
  };
});

vi.mock("../src/notification-helpers.js", () => ({
  notifyLicenseForTenant: notifyMock,
}));

vi.mock("../src/license-utils.js", () => ({
  insertLicenseHistory: vi.fn(),
}));

vi.mock("../src/license-finance-sync.js", () => ({
  triggerFinanceLicenseSync: vi.fn(),
}));

vi.mock("../src/pos-license-sync.js", () => ({
  suspendPosOrgForLicense: vi.fn(),
}));

import {
  daysUntilExpiry,
  pickExpiryMilestone,
  processLicenseExpiryFollowUp,
} from "../src/license-expire-followup.js";

describe("license expiry milestones", () => {
  beforeEach(() => {
    sendExpiringMock.mockClear();
    hasMilestoneMock.mockClear();
    notifyMock.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pickExpiryMilestone matches configured days only", () => {
    expect(pickExpiryMilestone(7)).toBe(7);
    expect(pickExpiryMilestone(8)).toBeNull();
    expect(pickExpiryMilestone(90)).toBe(90);
  });

  it("daysUntilExpiry rounds up partial days", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    const expires = new Date("2026-05-27T01:00:00.000Z");
    expect(daysUntilExpiry(expires, now)).toBe(7);
  });

  it("sends milestone email and notification once at 7 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));

    const licenseId = "lic-11111111-1111-1111-1111-111111111111";
    const tenantId = "tenant-11111111-1111-1111-1111-111111111111";
    const expiresAt = new Date("2026-05-27T12:00:00.000Z");

    const expiringRow = {
      id: licenseId,
      tenantId,
      expiresAt,
      gracePeriodDays: 7,
    };
    let selectCall = 0;
    const from = vi.fn(() => ({
      where: vi.fn().mockImplementation(async () => {
        selectCall += 1;
        return selectCall === 1 ? [expiringRow] : [];
      }),
    }));
    const select = vi.fn(() => ({ from }));
    const db = { select } as unknown as PostgresJsDatabase<typeof schema>;

    await processLicenseExpiryFollowUp(db, { justExpired: [], now: new Date() });

    expect(sendExpiringMock).toHaveBeenCalledOnce();
    expect(sendExpiringMock).toHaveBeenCalledWith(
      db,
      tenantId,
      expect.objectContaining({
        licenseId,
        milestoneDays: 7,
      }),
    );
    expect(notifyMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        licenseId,
        milestoneDays: 7,
        type: "license.expiring",
      }),
    );

    vi.useRealTimers();
  });

  it("skips when milestone notification already exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
    hasMilestoneMock.mockResolvedValue(true);

    let selectCall = 0;
    const from = vi.fn(() => ({
      where: vi.fn().mockImplementation(async () => {
        selectCall += 1;
        if (selectCall === 1) {
          return [
            {
              id: "lic-2",
              tenantId: "tenant-2",
              expiresAt: new Date("2026-05-27T12:00:00.000Z"),
              gracePeriodDays: 7,
            },
          ];
        }
        return [];
      }),
    }));
    const select = vi.fn(() => ({ from }));
    const db = { select } as unknown as PostgresJsDatabase<typeof schema>;

    await processLicenseExpiryFollowUp(db, {
      justExpired: [],
      now: new Date("2026-05-20T12:00:00.000Z"),
    });

    expect(sendExpiringMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
