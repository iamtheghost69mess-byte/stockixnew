import { apiConfig } from "@repo/config";
import { emailLogs } from "@repo/db/schema";
import type { createDb } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";
import type { Hono } from "hono";

import type { ControlPlaneAuthEnv } from "../middleware/auth.js";
import { hashRecipientEmail } from "../mail/email-log.js";
import { sendMail } from "../mail/mailer.js";

type Db = ReturnType<typeof createDb>;

const TEST_EMAIL_RECIPIENT = "jad.haidar.ahmad315@gmail.com";
const TEST_EMAIL_SUBJECT = "Stockix Email System Test";
const TEST_EMAIL_TEMPLATE_KEY = "dev_test_email";

async function findLatestEmailLogId(
  db: Db,
  opts: { templateKey: string; recipient: string; providerMessageId: string | null },
): Promise<string | null> {
  if (opts.providerMessageId) {
    const [byProviderId] = await db
      .select({ id: emailLogs.id })
      .from(emailLogs)
      .where(eq(emailLogs.providerMessageId, opts.providerMessageId))
      .orderBy(desc(emailLogs.createdAt))
      .limit(1);
    if (byProviderId) return byProviderId.id;
  }

  const [byRecipient] = await db
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.templateKey, opts.templateKey),
        eq(emailLogs.recipientHash, hashRecipientEmail(opts.recipient)),
      ),
    )
    .orderBy(desc(emailLogs.createdAt))
    .limit(1);

  return byRecipient?.id ?? null;
}

/** Dev-only POST /dev/test-email — not registered in production. */
export function registerDevTestEmailRoute(app: Hono<ControlPlaneAuthEnv>, db: Db): void {
  app.post("/dev/test-email", async (c) => {
    if (apiConfig.nodeEnv === "production") {
      return c.json({ error: "not_found" }, 404);
    }

    const timestamp = new Date().toISOString();
    const result = await sendMail({
      to: TEST_EMAIL_RECIPIENT,
      subject: TEST_EMAIL_SUBJECT,
      templateKey: TEST_EMAIL_TEMPLATE_KEY,
      html: [
        "<p>Stockix control-plane email pipeline test.</p>",
        `<p>Sent at: ${timestamp}</p>`,
        "<p>Compare the API response <code>provider_message_id</code> with Resend webhook <code>email_id</code>.</p>",
      ].join(""),
    });

    if (result.status !== "sent") {
      const detail =
        result.status === "skipped" ? result.reason : result.error;
      return c.json(
        {
          success: false,
          error: detail,
          provider_message_id: null,
          email_log_id: null,
          timestamp,
        },
        result.status === "skipped" ? 503 : 502,
      );
    }

    const providerMessageId = result.messageId || null;
    const emailLogId = await findLatestEmailLogId(db, {
      templateKey: TEST_EMAIL_TEMPLATE_KEY,
      recipient: TEST_EMAIL_RECIPIENT,
      providerMessageId,
    });

    return c.json({
      success: true,
      provider_message_id: providerMessageId,
      email_log_id: emailLogId,
      timestamp,
      recipient: TEST_EMAIL_RECIPIENT,
      template_key: TEST_EMAIL_TEMPLATE_KEY,
    });
  });
}
