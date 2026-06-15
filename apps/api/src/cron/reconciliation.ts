import { createDb } from "@repo/db";
import { adminAuditLog, tenants } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { execa } from "execa";
import { logger } from "../lib/logger.js";

function composeProjectName(slug: string): string {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

async function getRunningProjects(): Promise<Set<string>> {
  try {
    const { stdout } = await execa("docker", ["ps", "--format", "{{.Label \"com.docker.compose.project\"}}"]);
    const projects = stdout.split("\n").map(p => p.trim()).filter(Boolean);
    return new Set(projects);
  } catch (error) {
    logger.error("Failed to list running docker projects for reconciliation", error);
    return new Set();
  }
}

export async function runReconciliationLoop() {
  if (!process.env.DATABASE_URL) return;
  const db = createDb(process.env.DATABASE_URL);
  
  try {
    const activeTenants = await db
      .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, ownerId: tenants.ownerId })
      .from(tenants)
      .where(eq(tenants.status, "active"));
      
    if (activeTenants.length === 0) return;

    const runningProjects = await getRunningProjects();
    
    for (const tenant of activeTenants) {
      const projectName = composeProjectName(tenant.slug);
      if (!runningProjects.has(projectName)) {
        const message = `Reconciliation anomaly: Tenant ${tenant.slug} is 'active' in DB but has no running Docker containers.`;
        logger.error(message);
        
        await db.insert(adminAuditLog).values({
          actorId: tenant.ownerId, 
          action: "system.reconciliation.anomaly",
          targetTenantId: tenant.id,
          ipAddress: "system",
          userAgent: "reconciliation-loop",
          metadata: { error: message, expectedProject: projectName },
        }).catch(err => logger.error("Failed to insert audit log for reconciliation", err));
      }
    }
    logger.info(`[reconciliation] Checked ${activeTenants.length} active tenants against Docker state.`);
  } catch (error) {
    logger.error("[reconciliation] Error", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReconciliationLoop().then(() => process.exit(0)).catch(() => process.exit(1));
}
