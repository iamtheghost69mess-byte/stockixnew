import { dashboardConfig } from "@repo/config";
import postgres from "postgres";

const sql = postgres(dashboardConfig.databaseUrl, { max: 1 });
const d = await sql`
  SELECT t.slug, td.status, td.compose_project_name, td.last_error, td.updated_at
  FROM tenant_deployments td
  JOIN tenants t ON t.id = td.tenant_id
  WHERE td.compose_project_name ILIKE '%dajo%'
  ORDER BY td.updated_at DESC
  LIMIT 5
`;
console.log("deployments:", JSON.stringify(d, null, 2));
const ev = await sql`
  SELECT slug, phase, level, left(message, 200) AS message, created_at
  FROM tenant_provision_events
  WHERE message ILIKE '%HOST NOT PRIVILEGED%'
     OR message ILIKE '%database_migration%'
     OR message ILIKE '%compose%'
  ORDER BY created_at DESC
  LIMIT 12
`;
console.log("recent events:", JSON.stringify(ev, null, 2));
const recent = await sql`
  SELECT slug, phase, level, left(message, 120) AS message, created_at
  FROM tenant_provision_events
  ORDER BY created_at DESC
  LIMIT 6
`;
console.log("latest any:", JSON.stringify(recent, null, 2));
await sql.end();
