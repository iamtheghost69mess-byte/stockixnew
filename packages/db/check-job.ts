import postgres from 'postgres';

async function run() {
  const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform");
  const jobs = await sql`SELECT id, status, payload->>'slug' as slug FROM tenant_lifecycle_jobs ORDER BY created_at DESC LIMIT 5`;
  console.log(jobs);
  await sql.end();
}
run();
