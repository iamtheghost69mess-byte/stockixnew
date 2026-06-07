import postgres from "postgres";
import { loadEnvFilesAtRoot } from "./load-root-env.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFilesAtRoot(repoRoot);

const slug = process.argv[2] ?? "e2e-full-mq3zvm04-5fc6bcbc";
const sql = postgres(process.env.DATABASE_URL);

try {
  const [tenant] = await sql`select id, status from tenants where slug = ${slug}`;
  console.log("tenant:", tenant ?? "(not found)");
  if (tenant) {
    const jobs = await sql`
      select id, type, status, last_error, created_at, updated_at
      from tenant_lifecycle_jobs
      where tenant_id = ${tenant.id}
      order by created_at desc
      limit 10
    `;
    console.log("jobs:", JSON.stringify(jobs, null, 2));
  }
} finally {
  await sql.end();
}
