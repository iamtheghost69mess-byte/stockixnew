import postgres from "postgres";

const dbUrl = "postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform";
const sql = postgres(dbUrl);

async function run() {
  const activity = await sql`
    SELECT pid, query, state, age(clock_timestamp(), query_start) as age, wait_event_type as "waitEventType", wait_event as "waitEvent"
    FROM pg_stat_activity 
    WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
  `;
  console.log("ACTIVE POSTGRES ACTIVITY:");
  console.log(JSON.stringify(activity, null, 2));

  process.exit(0);
}

run().catch(console.error);
