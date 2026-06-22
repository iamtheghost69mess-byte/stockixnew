import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/schema.js";
import { tenantDeployments } from "./src/schema.js";

async function run() {
  const client = postgres("postgres://postgres:postgres@localhost:54330/stockix_platform");
  const db = drizzle(client, { schema });
  
  try {
    const query = db.insert(tenantDeployments).values({
      tenantId: "293bc40a-712e-4404-ad20-546869613cd3",
      status: "provisioning",
      composeProjectName: "stockix-jadhaidar",
      internalPort: 4113,
      mysqlPassword: "enc:...",
      mysqlRootPassword: "enc:...",
      jwtSecret: "enc:...",
      mongoUrl: "mongodb://...",
    }).toSQL();
    
    console.log("GENERATED SQL:", query.sql);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();
