import postgres from 'postgres';

async function run() {
  const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform");
  
  const jobs = await sql`SELECT * FROM tenant_lifecycle_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1`;
  console.log("FAILED JOB:", JSON.stringify(jobs, null, 2));

  const events = await sql`SELECT * FROM tenant_provision_events ORDER BY created_at DESC LIMIT 10`;
  console.log("EVENTS:", JSON.stringify(events, null, 2));

  await sql.end();
}
run();
