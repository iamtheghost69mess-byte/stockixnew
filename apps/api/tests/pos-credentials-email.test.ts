import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
}));

import { sendPosCredentialsEmail } from "../src/mail/send.js";

describe("sendPosCredentialsEmail", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends POS staff PIN table to tenant admin", async () => {
    await sendPosCredentialsEmail({
      to: "admin@demo.test",
      tenantName: "Demo Restaurant",
      posUrl: "https://pos.demo.stockix.app",
      credentials: [
        { role: "admin", username: "Admin", pin: "123456" },
        { role: "cashier", username: "Cashier", pin: "654321" },
      ],
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@demo.test",
        subject: "Your Stockix POS staff credentials",
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Demo Restaurant");
    expect(html).toContain("https://pos.demo.stockix.app");
    expect(html).toContain("123456");
    expect(html).toContain("654321");
    expect(html).toContain("cashier");
  });
});
