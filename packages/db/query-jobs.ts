import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { tenantLifecycleJobs } from "./src/schema";

async function run() {
  const client = postgres("postgres://postgres:postgres@localhost:54330/stockix_platform");
  const db = drizzle(client);
  
  try {
    const jobs = await db.select().from(tenantLifecycleJobs).where(eq(tenantLifecycleJobs.status, "pending"));
    console.log(JSON.stringify(jobs, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();
