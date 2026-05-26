/**
 * SMTP transport (Nodemailer). Production uses Resend SMTP — not the Resend SDK.
 * Configure MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_*.
 * RESEND_API_KEY is not required when using SMTP mode.
 */
import { createTransport } from "nodemailer";
import { isMailConfigured, mailConfig } from "@repo/config";

export type MailSendResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: "not_configured" | "suppressed" }
  | { status: "failed"; error: string };

export type SendMailOptions = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
  templateKey?: string;
  tenantId?: string;
  ownerId?: string;
};

export { isMailConfigured };

export const mailer = createTransport({
  host: mailConfig.host || "smtp.resend.com",
  port: mailConfig.port,
  secure: mailConfig.secure,
  auth: {
    user: mailConfig.username || "resend",
    pass: mailConfig.password,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 30000,
});

function formatFromHeader(): string {
  return `${mailConfig.fromName} <${mailConfig.fromAddress}>`;
}

let logEmailAttemptFn: ((opts: {
  templateKey: string;
  to: string;
  result: MailSendResult;
  idempotencyKey?: string;
  tenantId?: string;
  ownerId?: string;
}) => Promise<void>) | null = null;

/** Register DB logger after email_logs module loads (avoids circular imports). */
export function registerEmailLogHook(
  fn: NonNullable<typeof logEmailAttemptFn>,
): void {
  logEmailAttemptFn = fn;
}

export async function sendMail(options: SendMailOptions): Promise<MailSendResult> {
  const templateKey = options.templateKey ?? "unknown";

  if (!isMailConfigured()) {
    console.warn(
      `[mail] ${templateKey}: MAIL_PASSWORD or MAIL_FROM_ADDRESS not set; skipping send`,
    );
    const result: MailSendResult = { status: "skipped", reason: "not_configured" };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId,
      }).catch((err) => {
        console.error("[mail] email log failed:", err instanceof Error ? err.message : err);
      });
    }
    return result;
  }

  try {
    const info = await mailer.sendMail({
      from: formatFromHeader(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      headers: options.idempotencyKey
        ? { "Resend-Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
    const messageId =
      typeof info.messageId === "string" ? info.messageId : undefined;
    const result: MailSendResult = { status: "sent", messageId: messageId ?? "" };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId,
      }).catch((err) => {
        console.error("[mail] email log failed:", err instanceof Error ? err.message : err);
      });
    }
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[mail] ${templateKey}: send failed:`, error);
    const result: MailSendResult = { status: "failed", error };
    if (logEmailAttemptFn) {
      await logEmailAttemptFn({
        templateKey,
        to: options.to,
        result,
        idempotencyKey: options.idempotencyKey,
        tenantId: options.tenantId,
        ownerId: options.ownerId,
      }).catch((logErr) => {
        console.error("[mail] email log failed:", logErr instanceof Error ? logErr.message : logErr);
      });
    }
    return result;
  }
}

export async function sendMailOrThrow(options: SendMailOptions): Promise<MailSendResult> {
  const result = await sendMail(options);
  if (result.status !== "sent") {
    const detail =
      result.status === "skipped"
        ? "mail not configured"
        : result.error;
    throw new Error(`[mail] ${options.templateKey ?? "unknown"}: ${detail}`);
  }
  return result;
}

export function mailSendSucceeded(result: MailSendResult): boolean {
  return result.status === "sent";
}
