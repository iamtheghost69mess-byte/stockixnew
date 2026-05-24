/**
 * Wait until Stockix dev Postgres accepts connections (avoids migrate failing
 * immediately after `docker compose up -d`).
 */
import { dbConfig } from "@repo/config";
import postgres from "postgres";

const url = dbConfig.databaseUrl ?? "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";
const timeoutMs = dbConfig.waitTimeoutMs;
const intervalMs = 500;

function maskUrl(u: string) {
  try {
    const x = new URL(u);
    if (x.password) x.password = "****";
    return x.toString();
  } catch {
    return "(invalid url)";
  }
}

const deadline = Date.now() + timeoutMs;
let lastErr = "";

process.stdout.write(`Waiting for Postgres (${maskUrl(url)})...`);

while (Date.now() < deadline) {
  const sql = postgres(url, { max: 1, connect_timeout: 4 });
  try {
    await sql`SELECT 1`;
    await sql.end({ timeout: 2 });
    console.log("\nPostgres is ready.");
    process.exit(0);
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
    try {
      await sql.end({ timeout: 1 });
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    process.stdout.write(".");
  }
}

console.error("\nTimeout waiting for Postgres.");
console.error("Last error:", lastErr);
console.error("Expected: Docker dev DB on 127.0.0.1:54330 (pnpm db:up).");
console.error("Check DATABASE_URL in .env matches infra/dev/docker-compose.yml.");
process.exit(1);
