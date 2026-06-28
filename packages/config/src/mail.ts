import { env } from "./env.js";

export const mailConfig = {
  host: env.MAIL_HOST ?? "",
  port: parseInt(env.MAIL_PORT ?? "587", 10),
  username: env.MAIL_USERNAME ?? "",
  password: env.MAIL_PASSWORD ?? "",
  secure: !!env.MAIL_SECURE,
  fromName: env.MAIL_FROM_NAME ?? "Stockix",
  fromAddress: env.MAIL_FROM_ADDRESS ?? "",
  transport: (env.MAIL_TRANSPORT ?? "").trim().toLowerCase(),
} as const;

export function isMailConfigured(): boolean {
  return Boolean(mailConfig.password?.trim() && mailConfig.fromAddress?.trim());
}

export function getMailHealthStatus(): {
  configured: boolean;
  fromAddressSet: boolean;
  transport: "resend-api" | "smtp" | "unconfigured";
} {
  const password = mailConfig.password?.trim() ?? "";
  const configured = isMailConfigured();
  let transport: "resend-api" | "smtp" | "unconfigured" = "unconfigured";
  if (configured) {
    if (mailConfig.transport === "smtp") {
      transport = "smtp";
    } else if (password.startsWith("re_")) {
      transport = "resend-api";
    } else {
      transport = "smtp";
    }
  }
  return {
    configured,
    fromAddressSet: Boolean(mailConfig.fromAddress?.trim()),
    transport,
  };
}

export function getResendWebhookSecret(): string | undefined {
  return env.RESEND_WEBHOOK_SECRET?.trim() || undefined;
}
