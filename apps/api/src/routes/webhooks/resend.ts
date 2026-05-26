import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { getResendWebhookSecret } from "@repo/config";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { updateEmailLogDelivery } from "../../mail/email-log.js";
import { logger } from "../../lib/logger.js";

type Db = PostgresJsDatabase<typeof schema>;

type ApiEnv = {
  Variables: {
    actorId: string;
    actorRole: string;
    requestId: string;
    requestStartMs: number;
  };
};

function verifySvixSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
): boolean {
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");

  const signatures = headers.signature.split(" ");
  for (const part of signatures) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const expected = createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");
    try {
      const a = Buffer.from(sig, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // continue
    }
  }
  return false;
}

export function registerResendWebhook(app: Hono<ApiEnv>, db: Db | null): void {
  app.post("/webhooks/resend", async (c) => {
    if (!db) return c.json({ error: "DATABASE_URL is not configured" }, 503);

    const rawBody = await c.req.text();
    const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() || getResendWebhookSecret();

    if (!resendWebhookSecret && process.env.NODE_ENV === "production") {
      logger.error(
        "RESEND_WEBHOOK_SECRET not set in production — rejecting request",
        undefined,
        { event: "resend_webhook_secret_missing" },
      );
      return c.json({ error: "Webhook not configured" }, 401);
    }

    if (resendWebhookSecret) {
      const svixId = c.req.header("svix-id") ?? "";
      const svixTimestamp = c.req.header("svix-timestamp") ?? "";
      const svixSignature = c.req.header("svix-signature") ?? "";
      if (
        !verifySvixSignature(rawBody, {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        }, resendWebhookSecret)
      ) {
        return c.json({ error: "invalid_signature" }, 401);
      }
    } else {
      logger.warn(
        "RESEND_WEBHOOK_SECRET not set — accepting webhook without signature verification (dev only)",
        { event: "resend_webhook_secret_missing_dev" },
      );
    }

    let payload: { type?: string; data?: { email_id?: string; message_id?: string } };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const messageId =
      payload.data?.email_id ?? payload.data?.message_id ?? null;
    if (!messageId || typeof messageId !== "string") {
      return c.json({ ok: true, skipped: "no_message_id" });
    }

    const eventType = payload.type ?? "unknown";
    const deliveryStatus = eventType.replace(/^email\./, "");

    try {
      await updateEmailLogDelivery(db, messageId, deliveryStatus);
    } catch (err) {
      console.error(
        "[webhooks/resend] update failed:",
        err instanceof Error ? err.message : err,
      );
    }

    return c.json({ ok: true });
  });
}
