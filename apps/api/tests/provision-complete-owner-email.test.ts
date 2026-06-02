import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "test-id" }),
);

vi.mock("../src/mail/mailer.js", () => ({
  sendMail: sendMailMock,
  mailSendSucceeded: (r: { status: string }) => r.status === "sent",
}));

vi.mock("@repo/config", () => ({
  apiConfig: {
    brandName: "Stockix",
    dashboardUrl: "http://localhost:3000",
  },
  mailConfig: {
    fromName: "Stockix",
  },
}));

import { sendProvisionCompleteOwnerEmail } from "../src/mail/send.js";

describe("sendProvisionCompleteOwnerEmail", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends a provisioning complete notification to the owner", async () => {
    await sendProvisionCompleteOwnerEmail({
      to: "owner@platform.test",
      tenantName: "Acme Corp",
      tenantId: "tenant-abc-123",
      tenantSlug: "acme-corp",
      ownerId: "owner-xyz",
      adminEmail: "admin@acme.test",
      planSlug: "pro",
      modules: ["accounting", "pos"],
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@platform.test",
        subject: "Tenant provisioned: Acme Corp",
        idempotencyKey: "provision-complete-owner/tenant-abc-123",
        templateKey: "provision-complete-owner",
        ownerId: "owner-xyz",
        tenantId: "tenant-abc-123",
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Acme Corp");
    expect(html).toContain("acme-corp");
    expect(html).toContain("admin@acme.test");
  });

  it("works without optional tenantSlug and ownerId", async () => {
    await sendProvisionCompleteOwnerEmail({
      to: "owner@platform.test",
      tenantName: "Beta Ltd",
      tenantId: "tenant-beta-456",
    });

    expect(sendMailMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@platform.test",
        subject: "Tenant provisioned: Beta Ltd",
        idempotencyKey: "provision-complete-owner/tenant-beta-456",
        templateKey: "provision-complete-owner",
        tenantId: "tenant-beta-456",
      }),
    );
    const html = sendMailMock.mock.calls[0]![0]!.html as string;
    expect(html).toContain("Beta Ltd");
    // Fallback values in render layout
    expect(html).toContain("—");
  });
});
