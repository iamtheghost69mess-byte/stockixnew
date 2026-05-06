import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { dbConfig } from "@repo/config";

// Load .env for local dev defaults; do NOT use override so an exported DATABASE_URL
// (e.g. from CI or production deploy script) always takes precedence over the dev .env.
config({ path: ".env" });
config({ path: ".env.local", override: true });

const databaseUrl =
  dbConfig.databaseUrl ??
  "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
