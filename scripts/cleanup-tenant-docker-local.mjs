/**
 * Tear down local tenant Docker stacks and Stockix *:local images built from the clone.
 * Does NOT run `docker system prune` or remove base images (node:22-alpine, mongo:5.0, etc.).
 *
 * Usage (repo root):
 *   node scripts/cleanup-tenant-docker-local.mjs
 *   node scripts/cleanup-tenant-docker-local.mjs --delete-env-dirs
 *   node scripts/cleanup-tenant-docker-local.mjs --exclude stockix-finance
 *   node scripts/cleanup-tenant-docker-local.mjs --prune-dangling   # optional: remove dangling images only
 *
 * Env:
 *   STOCKIX_CLEANUP_EXCLUDE — comma-separated compose project names to skip (default: stockix-finance)
 */
import { execa } from "execa";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(repoRoot, "infra", "tenant-stack", "docker-compose.yml");

/** Locally built tags from infra/tenant-stack/docker-compose.yml */
const LOCAL_TAGS = [
  "stockix-server:local",
  "stockix-database-migration:local",
];

function composeProjectFromSlug(slug) {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function parseArgs(argv) {
  const deleteEnvDirs = argv.includes("--delete-env-dirs");
  const pruneDangling = argv.includes("--prune-dangling");
  const exclude = new Set(
    (process.env.STOCKIX_CLEANUP_EXCLUDE ?? "stockix-finance")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const excludeFlag = argv.find((a) => a.startsWith("--exclude="));
  if (excludeFlag) {
    for (const n of excludeFlag.slice("--exclude=".length).split(",")) {
      const t = n.trim();
      if (t) exclude.add(t);
    }
  }
  return { deleteEnvDirs, exclude, pruneDangling };
}

async function dockerComposeDownProject(project) {
  const { exitCode } = await execa(
    "docker",
    ["compose", "-p", project, "down", "--remove-orphans", "-v", "--timeout", "30"],
    { stdio: "inherit", reject: false },
  );
  if (exitCode !== 0) {
    console.warn(`[cleanup] Warning: compose down exited ${exitCode} for ${project}`);
  }
}

/** Uses compose file + tenant .env (same as provisioning) for a reliable teardown. */
async function dockerComposeDownFromEnv(slug, envPath) {
  const project = composeProjectFromSlug(slug);
  const { exitCode } = await execa(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "-p",
      project,
      "--env-file",
      envPath,
      "down",
      "--remove-orphans",
      "-v",
      "--timeout",
      "30",
    ],
    { stdio: "inherit", reject: false },
  );
  if (exitCode !== 0) {
    console.warn(`[cleanup] Warning: compose down exited ${exitCode} for ${project} (${envPath})`);
  }
}

async function listComposeProjects() {
  const { stdout } = await execa("docker", ["compose", "ls", "-a", "--format", "{{.Name}}"], {
    reject: false,
  });
  if (!stdout.trim()) return [];
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function removeLocalImages() {
  const tags = [...LOCAL_TAGS];
  for (const tag of tags) {
    const { exitCode } = await execa("docker", ["rmi", "-f", tag], {
      stdio: "inherit",
      reject: false,
    });
    if (exitCode !== 0) {
      // Image may not exist; ignore.
    }
  }
}

async function main() {
  const { deleteEnvDirs, exclude, pruneDangling } = parseArgs(process.argv.slice(2));

  console.log("[cleanup] Repo compose file:", composeFile);
  console.log("[cleanup] Excluding compose projects:", [...exclude].join(", ") || "(none)");

  const tenantsRoot = path.join(homedir(), ".stockix", "tenants");
  if (existsSync(tenantsRoot)) {
    const slugs = await readdir(tenantsRoot);
    for (const slug of slugs) {
      const envPath = path.join(tenantsRoot, slug, ".env");
      const project = composeProjectFromSlug(slug);
      if (!existsSync(envPath) || exclude.has(project)) continue;
      console.log(`\n[cleanup] Tenant env: ${envPath}`);
      await dockerComposeDownFromEnv(slug, envPath);
    }
  }

  const projects = await listComposeProjects();
  const tenantProjects = projects.filter(
    (name) => name.startsWith("stockix-") && !exclude.has(name),
  );

  if (tenantProjects.length === 0) {
    console.log("[cleanup] No matching compose projects in `docker compose ls` (stockix-*).");
  } else {
    console.log("\n[cleanup] Also tearing down compose ls projects:", tenantProjects.join(", "));
    for (const project of tenantProjects) {
      console.log(`\n[cleanup] docker compose -p ${project} down -v ...`);
      await dockerComposeDownProject(project);
    }
  }

  console.log("\n[cleanup] Removing shared locally built Stockix images (:local tags)...");
  await removeLocalImages();

  if (pruneDangling) {
    console.log("\n[cleanup] docker image prune -f (dangling only; does not remove base images)");
    await execa("docker", ["image", "prune", "-f"], { stdio: "inherit" });
  }

  if (deleteEnvDirs && existsSync(tenantsRoot)) {
    const slugs = await readdir(tenantsRoot);
    for (const slug of slugs) {
      const dir = path.join(tenantsRoot, slug);
      console.log(`\n[cleanup] Removing ${dir}`);
      await rm(dir, { recursive: true, force: true });
    }
    console.log("[cleanup] Deleted ~/.stockix/tenants/*");
  } else if (!deleteEnvDirs) {
    console.log(
      "\n[cleanup] Tenant env dirs kept. Run with --delete-env-dirs to remove ~/.stockix/tenants/<slug>/",
    );
  }

  console.log(
    "\n[cleanup] Done. Base images (node, mongo, redis, mariadb, postgres) were not removed.",
  );
  console.log("[cleanup] Next provision will rebuild stockix-*:local from STOCKIX_TENANT_APP_ROOT.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
