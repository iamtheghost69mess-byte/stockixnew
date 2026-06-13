import { randomUUID } from "crypto";
import postgres from "postgres";

async function run() {
  const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54330/stockix_platform");
  
  const id = randomUUID();
  const correlationId = randomUUID();
  
  await sql`
    INSERT INTO tenant_lifecycle_jobs (
      id, type, status, correlation_id, payload, priority, max_attempts, created_at, updated_at
    ) VALUES (
      ${id}, 'tenant.provision', 'pending', ${correlationId}, 
      ${JSON.stringify({
        name: "debugbull",
        slug: "debugbull",
        modules: ["accounting"],
        ownerId: "05fb7975-8a15-44ef-ace7-d722efee8727",
        planSlug: "enterprise",
        adminEmail: "jad.haidar.ahmad315@gmail.com",
        needsScrub: true,
        adminLastName: "debugbull",
        adminFirstName: "debugbull",
        provisionRequestedById: "05fb7975-8a15-44ef-ace7-d722efee8727"
      })}, 
      0, 5, NOW(), NOW()
    );
  `;
  
  console.log("Job created:", id, "Correlation:", correlationId);
  await sql.end();
}

run();
