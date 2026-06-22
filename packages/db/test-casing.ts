import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

const tenantDeployments = pgTable("tenant_deployments", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
});

async function run() {
  const client = postgres("postgres://postgres:postgres@localhost:54330/stockix_platform");
  const db = drizzle(client, { casing: "snake_case" });
  
  try {
    const query = db.insert(tenantDeployments).values({
      id: "123",
      tenantId: "456",
    }).toSQL();
    
    console.log("GENERATED SQL:", query.sql);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();
