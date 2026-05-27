/**
 * Mail transport (Resend). Default: REST API when MAIL_PASSWORD is a Resend key (`re_*`)
 * so provider_message_id matches webhook data.email_id. Set MAIL_TRANSPORT=smtp for Nodemailer.
 * Configure MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_*.
 */
import { createTransport } from "nodemailer";
import { isMailConfigured, mailConfig } from "@repo/config";

import { sendViaResendApi } from "./resend-api.js";

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

/** Resend API key in MAIL_PASSWORD returns webhook-compatible email ids. */
function shouldUseResendApi(): boolean {
  if (process.env.MAIL_TRANSPORT?.trim().toLowerCase() === "smtp") return false;
  const apiKey = mailConfig.password?.trim() ?? "";
  return apiKey.startsWith("re_");
}

async function sendViaConfiguredTransport(options: SendMailOptions): Promise<string> {
  if (shouldUseResendApi()) {
    const apiResult = await sendViaResendApi({
      from: formatFromHeader(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      idempotencyKey: options.idempotencyKey,
      apiKey: mailConfig.password!.trim(),
    });
    if ("error" in apiResult) {
      throw new Error(apiResult.error);
    }
    return apiResult.id;
  }

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
  return messageId ?? "";
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
    const providerMessageId = await sendViaConfiguredTransport(options);
    const result: MailSendResult = {
      status: "sent",
      messageId: providerMessageId,
    };
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
