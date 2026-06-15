import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateEmailLogDeliveryByCandidatesMock = vi.fn();

vi.mock("../src/mail/email-log.js", () => ({
  updateEmailLogDeliveryByCandidates: updateEmailLogDeliveryByCandidatesMock,
}));

vi.mock("@repo/config", () => ({
  apiConfig: { nodeEnv: "test" },
  getResendWebhookSecret: () => "whsec_" + Buffer.from("test-signing-secret").toString("base64"),
}));

function signSvixPayload(
  rawBody: string,
  secret: string,
  opts?: { id?: string; timestamp?: string },
): { id: string; timestamp: string; signature: string } {
  const id = opts?.id ?? "msg_test_123";
  const timestamp = opts?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const sig = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return { id, timestamp, signature: `v1,${sig}` };
}

describe("POST /webhooks/resend", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    updateEmailLogDeliveryByCandidatesMock.mockResolvedValue({
      rowsAffected: 1,
      matchedProviderMessageId: "email_abc",
    });
    const { registerResendWebhook } = await import("../src/routes/webhooks/resend.js");
    app = new Hono();
    registerResendWebhook(app, {} as never);
  });

  it("accepts a valid Svix signature and updates delivery status", async () => {
    const secret = "whsec_" + Buffer.from("test-signing-secret").toString("base64");
    const rawBody = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "email_abc", message_id: "<msg@resend>" },
    });
    const headers = signSvixPayload(rawBody, secret);

    const res = await app.request("/webhooks/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": headers.id,
        "svix-timestamp": headers.timestamp,
        "svix-signature": headers.signature,
      },
      body: rawBody,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(updateEmailLogDeliveryByCandidatesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["email_abc"]),
      "delivered",
    );
  });

  it("rejects invalid signatures when secret is configured", async () => {
    const rawBody = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "email_abc" },
    });

    const res = await app.request("/webhooks/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_bad",
        "svix-timestamp": "1710000000",
        "svix-signature": "v1,invalid",
      },
      body: rawBody,
    });

    expect(res.status).toBe(401);
    expect(updateEmailLogDeliveryByCandidatesMock).not.toHaveBeenCalled();
  });

  it("returns ok without DB update when message id is missing", async () => {
    const secret = "whsec_" + Buffer.from("test-signing-secret").toString("base64");
    const rawBody = JSON.stringify({ type: "email.sent", data: {} });
    const headers = signSvixPayload(rawBody, secret);

    const res = await app.request("/webhooks/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": headers.id,
        "svix-timestamp": headers.timestamp,
        "svix-signature": headers.signature,
      },
      body: rawBody,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped?: string };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe("no_message_id");
    expect(updateEmailLogDeliveryByCandidatesMock).not.toHaveBeenCalled();
  });
});
