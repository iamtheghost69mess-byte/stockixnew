#!/usr/bin/env node
/**
 * Local "start from scratch": tear down Stockix **tenant** Docker projects, clear build cache, optional tenant .env files.
 * Does **not** delete the Stockix platform Postgres container unless --platform-postgres.
 *
 * Dry-run by default. To execute destructive steps:
 *
 *   STOCKIX_RESET_CONFIRM=1 pnpm stockix:reset-local -- --execute
 *
 * Options:
 *   --execute              Actually run docker down / prune / deletes (requires STOCKIX_RESET_CONFIRM=1)
 *   --tenant-env           Delete %USERPROFILE%\\.stockix\\tenants\\* (or TENANT_ENV_ROOT/*)
 *   --builder              docker builder prune -af
 *   --stockix-images       docker rmi stockix/bigcapital-* for STOCKIX_BC_TAG (from env/development/tenant-docker-build.env or latest)
 *   --platform-postgres    docker compose -f infra/dev/docker-compose.yml down -v (wipes stockix_platform volume!)
 *
 * Safe order: run `pnpm provision:preflight`, then reset, then `pnpm images:fresh`, then `pnpm setup:local`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function usage() {
  console.log(`Usage: node scripts/stockix-local-reset.mjs [--execute] [--tenant-env] [--builder] [--stockix-images] [--platform-postgres]

Without --execute: prints what would happen only.

Execution requires: STOCKIX_RESET_CONFIRM=1
`);
}

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
  usage();
  process.exit(0);
}

const execute = argv.includes("--execute");
const wantTenantEnv = argv.includes("--tenant-env");
const wantBuilder = argv.includes("--builder");
const wantStockixImages = argv.includes("--stockix-images");
const wantPlatformPg = argv.includes("--platform-postgres");

function discoverStockixComposeProjects() {
  try {
    const out = execFileSync(
      "docker",
      [
        "ps",
        "-a",
        "--filter",
        "label=com.docker.compose.project",
        "--format",
        "{{.Label \"com.docker.compose.project\"}}",
      ],
      { encoding: "utf8" },
    );
    const set = new Set();
    for (const line of out.split(/\r?\n/)) {
      const p = line.trim();
      if (p.startsWith("stockix-")) set.add(p);
    }
    return [...set].sort();
  } catch {
    return [];
  }
}

function composeDownProject(project) {
  const args = ["compose", "-p", project, "down", "-v", "--remove-orphans"];
  console.error("docker", args.join(" "));
  execFileSync("docker", args, { stdio: "inherit", cwd: repoRoot });
}

function main() {
  const confirmed = String(process.env.STOCKIX_RESET_CONFIRM ?? "").trim() === "1";

  console.error("Stockix local reset\n");

  const projects = discoverStockixComposeProjects();
  console.error(
    projects.length
      ? `Found compose projects: ${projects.join(", ")}`
      : "No stockix-* compose projects found (docker ps may be empty).",
  );

  const tenantEnvRoot =
    process.env.TENANT_ENV_ROOT?.trim() ||
    (platform() === "win32"
      ? join(homedir(), ".stockix", "tenants")
      : "/opt/stockix/tenants");

  if (!execute) {
    console.error("\n[DRY RUN] With --execute would:");
    for (const p of projects) {
      console.error(`  • docker compose -p ${p} down -v --remove-orphans`);
    }
    if (wantBuilder) {
      console.error("  • docker builder prune -af");
    }
    if (wantTenantEnv) {
      console.error(`  • remove contents of TENANT_ENV_ROOT: ${tenantEnvRoot}`);
    }
    if (wantStockixImages) {
      console.error("  • docker rmi stockix/bigcapital-*:<tag>");
    }
    if (wantPlatformPg) {
      console.error(
        "  • docker compose -f infra/dev/docker-compose.yml down -v  (DESTROYS platform Postgres volume)",
      );
    }
    console.error(`
Optional flags (repeat with --execute): --builder --tenant-env --stockix-images --platform-postgres

Full tenant wipe (keeps platform Postgres): STOCKIX_RESET_CONFIRM=1 pnpm stockix:reset-local -- --execute --tenant-env --builder --stockix-images
`);
    process.exit(0);
  }

  if (!confirmed) {
    console.error(
      "Refusing --execute without STOCKIX_RESET_CONFIRM=1 (safety).",
    );
    process.exit(1);
  }

  for (const p of projects) {
    console.error(`\n--- compose down: ${p} ---\n`);
    try {
      composeDownProject(p);
    } catch (e) {
      console.error(e?.message ?? e);
    }
  }

  if (wantPlatformPg) {
    console.error("\n--- platform Postgres (infra/dev) down -v ---\n");
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        join(repoRoot, "infra/dev/docker-compose.yml"),
        "down",
        "-v",
      ],
      { stdio: "inherit", cwd: repoRoot },
    );
  }

  if (wantBuilder) {
    console.error("\n--- docker builder prune -af ---\n");
    execFileSync("docker", ["builder", "prune", "-af"], {
      stdio: "inherit",
    });
  }

  if (wantStockixImages) {
    const envPath = join(repoRoot, "env/development/tenant-docker-build.env");
    let tag = "latest";
    if (existsSync(envPath)) {
      const v = parseEnvFile(readFileSync(envPath, "utf8"));
      tag = v.STOCKIX_BC_TAG?.trim() || "latest";
    }
    const images = [
      `stockix/bigcapital-webapp:${tag}`,
      `stockix/bigcapital-server:${tag}`,
      `stockix/bigcapital-nginx:${tag}`,
      `stockix/bigcapital-migration:${tag}`,
    ];
    console.error("\n--- docker rmi stockix/bigcapital-* ---\n");
    for (const img of images) {
      try {
        execFileSync("docker", ["rmi", "-f", img], { stdio: "inherit" });
      } catch {
        console.error("(skip)", img);
      }
    }
  }

  if (wantTenantEnv && existsSync(tenantEnvRoot)) {
    console.error("\n--- clear tenant .env dirs ---\n", tenantEnvRoot);
    for (const name of readdirSync(tenantEnvRoot)) {
      const p = join(tenantEnvRoot, name);
      rmSync(p, { recursive: true, force: true });
      console.error("removed", p);
    }
  }

  console.error(`
Done. Suggested rebuild:

  pnpm bootstrap:env
  pnpm images:fresh
  pnpm setup:local
  pnpm provision:preflight
  pnpm --filter api run provision-smoke -- --full
`);
}

main();
