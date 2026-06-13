import { createDb } from "@repo/db";
import { tenants } from "@repo/db/schema";
import { execa } from "execa";
import { logger } from "../lib/logger.js";
import { composeProjectName } from "../../domain/provisioning/compose-project-name.js";
import { scrubTenantRuntimeArtifacts } from "../../domain/scrub-tenant-artifacts.js";

async function getOrphanedProjects(activeSlugs: Set<string>): Promise<string[]> {
  try {
    const { stdout } = await execa("docker", ["ps", "-a", "--format", "{{.Label \"com.docker.compose.project\"}}"]);
    const projects = stdout.split("\n").map(p => p.trim()).filter(Boolean);
    const uniqueProjects = [...new Set(projects)];
    
    // stockix-shared is the shared infrastructure, keep it.
    // other projects should be stockix-${slug}.
    const orphanProjects = uniqueProjects.filter(project => {
      if (!project.startsWith("stockix-")) return false;
      if (project === "stockix-shared") return false;
      
      const slug = project.replace(/^stockix-/, "");
      return !activeSlugs.has(slug);
    });
    
    return orphanProjects;
  } catch (error) {
    logger.error("Failed to list docker projects", error);
    return [];
  }
}

export async function runOrphanCleanup() {
  const db = createDb(process.env.DATABASE_URL!);
  
  try {
    const activeTenants = await db.select({ slug: tenants.slug }).from(tenants);

    if (activeTenants.length === 0) {
      throw new Error(
        "Safety abort: DB returned 0 active tenants. " +
        "Refusing to run orphan cleanup to prevent mass deletion."
      );
    }

    const activeSlugs = new Set(activeTenants.map(t => t.slug));
    
    const orphans = await getOrphanedProjects(activeSlugs);
    
    if (orphans.length === 0) {
      logger.info("[orphan-cleanup] No orphaned Docker projects found.");
      return;
    }
    
    for (const project of orphans) {
      const slug = project.replace(/^stockix-/, "");
      logger.warn(`[orphan-cleanup] Found orphaned project ${project}. Scrubbing resources for slug: ${slug}`);
      
      try {
        await scrubTenantRuntimeArtifacts(slug);
        logger.info(`[orphan-cleanup] Successfully scrubbed ${project}`);
      } catch (err) {
        logger.error(`[orphan-cleanup] Failed to scrub ${project}`, err);
      }
    }
  } catch (error) {
    logger.error("[orphan-cleanup] Error running orphan cleanup job", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrphanCleanup().then(() => process.exit(0)).catch(() => process.exit(1));
}
