import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// `override: true` so repo `.env` wins over a machine-level DATABASE_URL (common on Windows),
// which often points at the wrong Postgres (e.g. :5432) and breaks migrate with 28P01.
config({ path: ".env", override: true });
config({ path: ".env.local", override: true });

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
