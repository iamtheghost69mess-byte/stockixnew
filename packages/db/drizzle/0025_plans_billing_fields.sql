ALTER TABLE "plans"
  ADD COLUMN "price_monthly" integer,
  ADD COLUMN "price_annually" integer,
  ADD COLUMN "currency" text DEFAULT 'USD',
  ADD COLUMN "billing_interval" text,
  ADD COLUMN "is_public" boolean NOT NULL DEFAULT false,
  ADD COLUMN "features" text;
