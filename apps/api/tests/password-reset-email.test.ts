import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn());

vi.mock("../src/mail/mailer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/mail/mailer.js")>();
  return {
    ...actual,
    sendMail: sendMailMock,
  };
});

import { sendOwnerPasswordResetEmail } from "../src/mail/send.js";

describe("sendOwnerPasswordResetEmail", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ status: "sent", messageId: "msg-1" });
  });

  it("sends reset email with link and idempotency key", async () => {
    await sendOwnerPasswordResetEmail({
      to: "admin@example.com",
      name: "Admin",
      resetUrl: "https://app.example.com/reset-password?token=abc",
      ownerId: "owner-1",
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "Reset your Stockix password",
        templateKey: "password-reset",
        ownerId: "owner-1",
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("reset-password?token=abc");
    expect(html).toContain("Admin");
  });
});
