/**
 * Ensures a local demo tenant with the PMS module licensed (for /pms UI).
 * Run: pnpm db:seed:pms-demo
 */
import { dashboardConfig } from "@repo/config";
import postgres from "postgres";

const url = dashboardConfig.databaseUrl;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const DEMO_SLUG = "pms-demo";
const DEMO_NAME = "PMS Demo";
const DEMO_ADMIN_EMAIL = "pms-demo-admin@localhost.test";
const MODULES = JSON.stringify(["accounting", "pms"]);

const sql = postgres(url, { max: 1 });

try {
  const owners = await sql`
    SELECT id, email FROM owners WHERE status = 'active' ORDER BY created_at ASC LIMIT 1
  `;
  if (owners.length === 0) {
    console.error("No active owner found. Run pnpm db:seed:local first.");
    process.exit(1);
  }
  const ownerId = owners[0]!.id as string;

  const existing = await sql`
    SELECT id, slug, modules FROM tenants WHERE slug = ${DEMO_SLUG} LIMIT 1
  `;

  let tenantId: string;
  if (existing.length > 0) {
    tenantId = existing[0]!.id as string;
    await sql`
      UPDATE tenants
      SET
        name = ${DEMO_NAME},
        modules = ${MODULES},
        status = 'active',
        admin_email = ${DEMO_ADMIN_EMAIL},
        admin_first_name = 'PMS',
        admin_last_name = 'Demo'
      WHERE id = ${tenantId}
    `;
    console.log("Updated demo tenant:", DEMO_SLUG, tenantId);
  } else {
    const inserted = await sql`
      INSERT INTO tenants (
        slug, name, owner_id, admin_email, admin_first_name, admin_last_name,
        status, plan_slug, modules
      )
      VALUES (
        ${DEMO_SLUG},
        ${DEMO_NAME},
        ${ownerId},
        ${DEMO_ADMIN_EMAIL},
        'PMS',
        'Demo',
        'active',
        'starter',
        ${MODULES}
      )
      RETURNING id, slug
    `;
    tenantId = inserted[0]!.id as string;
    console.log("Created demo tenant:", inserted[0]);
  }

  const org = await sql`
    SELECT id FROM organizations WHERE tenant_id = ${tenantId} LIMIT 1
  `;
  if (org.length === 0) {
    await sql`
      INSERT INTO organizations (tenant_id, name, slug, subdomain, status, is_primary)
      VALUES (
        ${tenantId},
        ${DEMO_NAME},
        ${DEMO_SLUG},
        ${DEMO_SLUG},
        'active',
        true
      )
    `;
    console.log("Created primary organization for", DEMO_SLUG);
  } else {
    await sql`
      UPDATE organizations SET status = 'active' WHERE tenant_id = ${tenantId}
    `;
  }

  const existingProperty = await sql`
    SELECT id FROM pms_properties WHERE tenant_id = ${tenantId} LIMIT 1
  `;
  if (existingProperty.length === 0) {
    await sql`
      INSERT INTO pms_properties (tenant_id, name, type, address, city, country, description)
      VALUES (
        ${tenantId},
        ${"Grand Horizon Demo Hotel"},
        ${"hotel"},
        ${"102 Ocean Drive"},
        ${"Miami"},
        ${"USA"},
        ${"Sample property for local PMS development."}
      )
    `;
    console.log("Created demo property for", DEMO_SLUG);
  }

  const prop = await sql`
    SELECT id FROM pms_properties WHERE tenant_id = ${tenantId} LIMIT 1
  `;
  if (prop.length > 0) {
    const propertyId = prop[0]!.id as string;
    const existingRoom = await sql`
      SELECT id FROM pms_rooms WHERE tenant_id = ${tenantId} LIMIT 1
    `;
    if (existingRoom.length === 0) {
      await sql`
        INSERT INTO pms_rooms (
          tenant_id, property_id, name, type, capacity, rate_cents, status
        )
        VALUES (
          ${tenantId},
          ${propertyId},
          ${"Ocean View Suite"},
          ${"suite"},
          ${4},
          ${25000},
          ${"available"}
        )
      `;
      console.log("Created demo room for", DEMO_SLUG);
    }
  }

  console.log("\nPMS demo tenant ready.");
  console.log("Platform admin UI: http://localhost:3000/pms → select", DEMO_NAME);
  console.log("Tenant PMS app:    http://localhost:3004 (after pnpm dev)");
  console.log("Tenant id:", tenantId);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
