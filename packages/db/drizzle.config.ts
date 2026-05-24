import { defineConfig } from "drizzle-kit";
import { dbConfig } from "@repo/config";

const databaseUrl =
  dbConfig.databaseUrl ??
  "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
