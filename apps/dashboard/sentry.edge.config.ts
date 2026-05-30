import * as Sentry from "@sentry/nextjs";

export function init() {
  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.05,
  });
}
