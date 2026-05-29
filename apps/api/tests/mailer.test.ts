import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@repo/config", () => ({
  mailConfig: {
    host: "smtp.resend.com",
    port: 587,
    username: "resend",
    password: "",
    secure: false,
    fromName: "Stockix",
    fromAddress: "",
  },
  isMailConfigured: () => false,
}));

describe("sendMail when not configured", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns skipped result without throwing", async () => {
    const { sendMail } = await import("../src/mail/mailer.js");
    const result = await sendMail({
      to: "a@b.com",
      subject: "Test",
      html: "<p>x</p>",
      templateKey: "test",
    });
    expect(result).toEqual({ status: "skipped", reason: "not_configured" });
  });
});
