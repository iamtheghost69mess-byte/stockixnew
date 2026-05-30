import * as Sentry from "@sentry/nextjs";

export function init() {
  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "production",
    tracesSampleRate: 0.05,
  });
}
