import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "test-id" }),
);

vi.mock("@repo/config", () => ({
  apiConfig: {
    brandName: "Stockix",
    dashboardUrl: "https://dashboard.stockix.test",
    publicBaseUrlScheme: "https",
  },
}));

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
}));

import { sendProvisionCompleteOwnerEmail } from "../src/mail/send.js";

const tenantId = "tenant-22222222-2222-2222-2222-222222222222";
const ownerId = "owner-33333333-3333-3333-3333-333333333333";

describe("Provision complete owner email", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends owner notification with tenant details and dashboard link", async () => {
    await sendProvisionCompleteOwnerEmail({
      to: "owner@stockix.test",
      ownerId,
      tenantId,
      tenantName: "Demo Restaurant",
      tenantSlug: "demo-restaurant",
      adminEmail: "admin@demo.test",
      planSlug: "professional",
      modules: ["accounting", "pos"],
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@stockix.test",
        subject: "Tenant provisioned: Demo Restaurant",
        idempotencyKey: `provision-complete-owner/${tenantId}`,
        templateKey: "provision-complete-owner",
        tenantId,
        ownerId,
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Demo Restaurant");
    expect(html).toContain("demo-restaurant");
    expect(html).toContain("admin@demo.test");
    expect(html).toContain("Professional");
    expect(html).toContain("Accounting, Point of Sale");
    expect(html).toContain(`https://dashboard.stockix.test/tenants/${tenantId}`);
  });
});
