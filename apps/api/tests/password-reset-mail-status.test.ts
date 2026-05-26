import { describe, expect, it, vi, beforeEach } from "vitest";

const isMailConfiguredMock = vi.hoisted(() => vi.fn(() => false));
const sendOwnerPasswordResetEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@repo/config", () => ({
  apiConfig: {
    nodeEnv: "test",
    dashboardUrl: "http://localhost:3000",
  },
  isMailConfigured: isMailConfiguredMock,
}));

vi.mock("../src/mail/send.js", () => ({
  sendOwnerPasswordResetEmail: sendOwnerPasswordResetEmailMock,
  sendPasswordChangedEmail: vi.fn(),
}));

vi.mock("../src/mail/mailer.js", () => ({
  mailSendSucceeded: (result: { status: string }) => result.status === "sent",
}));

import { requestOwnerPasswordReset } from "../src/services/auth/password-reset.js";

describe("requestOwnerPasswordReset mail status", () => {
  beforeEach(() => {
    sendOwnerPasswordResetEmailMock.mockReset();
    isMailConfiguredMock.mockReset();
    isMailConfiguredMock.mockReturnValue(false);
  });

  it("returns mailConfigured false when mail is not configured", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      update: vi.fn(),
      insert: vi.fn(async () => undefined),
    } as never;

    const result = await requestOwnerPasswordReset(db, { email: "nobody@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mailConfigured).toBe(false);
      expect(result.data.ok).toBe(true);
    }
  });

  it("returns emailSent false when owner exists but mail send fails", async () => {
    isMailConfiguredMock.mockReturnValue(true);
    sendOwnerPasswordResetEmailMock.mockResolvedValue({ status: "skipped" });

    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [
              {
                id: "owner-1",
                name: "Admin",
                email: "admin@example.com",
                passwordHash: "hash",
                status: "active",
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
    } as never;

    const result = await requestOwnerPasswordReset(db, { email: "admin@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mailConfigured).toBe(true);
      expect(result.data.emailSent).toBe(false);
    }
  });
});
