/**
 * Rebuild and redeploy the tenant webapp from STOCKIX_TENANT_APP_ROOT source.
 * Uses --no-cache so BuildKit cannot reuse a stale COPY/RUN layer when iterating on
 * packages/webapp/src (e.g. useSwitchTenant.tsx).
 *
 * Usage (repo root):
 *   node scripts/rebuild-tenant-webapp.mjs
 *   node scripts/rebuild-tenant-webapp.mjs --tenant test
 *   node scripts/rebuild-tenant-webapp.mjs --tenant test --project stockix-test
 */
import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(repoRoot, "infra", "tenant-stack", "docker-compose.yml");

function parseArgs(argv) {
  let tenant = "test";
  let project = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tenant" && argv[i + 1]) tenant = argv[++i];
    else if (argv[i] === "--project" && argv[i + 1]) project = argv[++i];
  }
  if (!project) project = `stockix-${tenant}`;
  return { tenant, project };
}

async function main() {
  const { tenant, project } = parseArgs(process.argv.slice(2));
  const envPath = path.join(
    process.env.STOCKIX_TENANT_ENV_ROOT ?? path.join(process.env.HOME ?? process.env.USERPROFILE, ".stockix", "tenants"),
    tenant,
    ".env",
  );

  if (!existsSync(envPath)) {
    console.error(`[rebuild-webapp] Missing tenant env: ${envPath}`);
    process.exit(1);
  }

  const base = ["docker", "compose", "-f", composeFile, "--env-file", envPath, "-p", project];
  console.log(`[rebuild-webapp] project=${project} env=${envPath}`);

  await execa(...base, ["build", "--no-cache", "--progress", "plain", "webapp"], {
    stdio: "inherit",
    cwd: repoRoot,
  });

  await execa(...base, ["up", "-d", "--no-deps", "--force-recreate", "webapp"], {
    stdio: "inherit",
    cwd: repoRoot,
  });

  console.log("[rebuild-webapp] Done. Hard-refresh the browser (cached JS bundles are hashed).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
