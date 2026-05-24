import { createTransport } from "nodemailer";
import { mailConfig } from "@repo/config";

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

export async function sendMail(options: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  if (!mailConfig.password || !mailConfig.fromAddress) {
    console.warn("[mail] MAIL_PASSWORD or MAIL_FROM_ADDRESS not set; skipping send");
    return null;
  }

  return mailer.sendMail({
    from: formatFromHeader(),
    to: options.to,
    subject: options.subject,
    html: options.html,
    headers: options.idempotencyKey
      ? { "Resend-Idempotency-Key": options.idempotencyKey }
      : undefined,
  });
}
