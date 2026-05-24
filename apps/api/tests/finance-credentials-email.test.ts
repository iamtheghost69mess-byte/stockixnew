import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
}));

import { sendFinanceCredentialsEmail } from "../src/mail/send.js";

describe("sendFinanceCredentialsEmail", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends accounting access email with login URL and temporary password", async () => {
    await sendFinanceCredentialsEmail({
      to: "admin@demo.test",
      tenantName: "Demo Restaurant",
      financeUrl: "https://demo.stockix.app",
      adminEmail: "admin@demo.test",
      oneTimePassword: "temp-secret-123",
      modules: ["accounting", "pos"],
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@demo.test",
        subject: "Your Stockix accounting access is ready",
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Demo Restaurant");
    expect(html).toContain("https://demo.stockix.app");
    expect(html).toContain("admin@demo.test");
    expect(html).toContain("temp-secret-123");
    expect(html).toContain("accounting, pos");
  });
});
