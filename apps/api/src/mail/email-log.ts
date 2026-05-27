import { createHash } from "node:crypto";
import { emailLogs } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { logger } from "../lib/logger.js";
import type { MailSendResult } from "./mailer.js";
import { registerEmailLogHook } from "./mailer.js";

type Db = PostgresJsDatabase<typeof schema>;

export function hashRecipientEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function statusFromResult(result: MailSendResult): string {
  if (result.status === "sent") return "sent";
  if (result.status === "skipped") return "skipped";
  return "failed";
}

export async function logEmailAttempt(
  db: Db,
  opts: {
    templateKey: string;
    to: string;
    result: MailSendResult;
    idempotencyKey?: string;
    tenantId?: string;
    ownerId?: string;
  },
): Promise<void> {
  const errorText =
    opts.result.status === "failed"
      ? opts.result.error.slice(0, 2000)
      : opts.result.status === "skipped"
        ? opts.result.reason
        : null;

  const providerMessageId =
    opts.result.status === "sent" ? opts.result.messageId ?? null : null;

  await db.insert(emailLogs).values({
    templateKey: opts.templateKey,
    recipientHash: hashRecipientEmail(opts.to),
    status: statusFromResult(opts.result),
    providerMessageId,
    error: errorText,
    tenantId: opts.tenantId ?? null,
    ownerId: opts.ownerId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
  });

  if (opts.result.status === "sent") {
    logger.info("email send correlation debug", {
      event: "email_send_correlation_debug",
      provider_message_id: providerMessageId,
      recipient: opts.to,
      timestamp: new Date().toISOString(),
      template_key: opts.templateKey,
    });
  }
}

export function initEmailLogging(db: Db): void {
  registerEmailLogHook(async (opts) => {
    await logEmailAttempt(db, opts);
  });
}

export async function updateEmailLogDelivery(
  db: Db,
  providerMessageId: string,
  deliveryStatus: string,
): Promise<number> {
  const updated = await db
    .update(emailLogs)
    .set({ deliveryStatus })
    .where(eq(emailLogs.providerMessageId, providerMessageId))
    .returning({ id: emailLogs.id });
  return updated.length;
}
