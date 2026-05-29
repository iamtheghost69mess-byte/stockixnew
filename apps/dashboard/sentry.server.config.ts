import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.SENTRY_DSN;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.APP_ENV ?? "production",
    tracesSampleRate: 0.05,
  });
}
