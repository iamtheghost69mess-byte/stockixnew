/**
 * One-shot tenant stack repair — default path recreates the FULL compose project (fixes 502, stale nginx upstream, MySQL drift).
 *
 *   1. Align MySQL app user with tenant .env (repair:tenant-mysql).
 *   2. Rebuild nginx from BIGCAPITAL_ROOT (resolver + variable proxy_pass).
 *   3. Optionally rebuild server + webapp images (--rebuild-images).
 *   4. docker compose up -d --force-recreate for ALL services (full stack).
 *   5. Wait until GET /api/ping/ returns 200 on PUBLIC_PROXY_PORT (long deadline + generous curl timeout).
 *
 *   pnpm repair:tenant -- <slug>
 *
 * Options:
 *   --skip-mysql         Skip ALTER USER.
 *   --no-nginx-build     Skip nginx image rebuild (faster, not recommended for 502).
 *   --rebuild-images     Also `docker compose build server webapp database_migration` before up.
 *   --light              Only recreate server+nginx, 2 min ping wait, 8s curl (old quick path).
 *
 * Env: TENANT_ENV_ROOT. Optional: REPAIR_PING_DEADLINE_MS (default 600000), REPAIR_CURL_MAX_SEC (default 45).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

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

function composeProjectName(slug) {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

async function main() {
  const argv = process.argv.slice(2);
  const skipMysql = argv.includes("--skip-mysql");
  const noNginxBuild = argv.includes("--no-nginx-build");
  const rebuildImages = argv.includes("--rebuild-images");
  const light = argv.includes("--light");
  const args = argv.filter(
    (a) =>
      ![
        "--skip-mysql",
        "--no-nginx-build",
        "--rebuild-images",
        "--light",
      ].includes(a),
  );

  let slug = process.env.STOCKIX_TENANT_SLUG?.trim();
  for (const a of args) {
    if (a.startsWith("--slug=")) slug = a.slice(7).trim();
    else if (!a.startsWith("-") && slug === undefined) slug = a;
  }

  if (!slug) {
    console.error(`Usage: pnpm repair:tenant -- <tenant-slug>
Options: --skip-mysql  --no-nginx-build  --rebuild-images  --light`);
    process.exit(1);
  }

  const tenantEnvRoot =
    process.env.TENANT_ENV_ROOT?.trim() ||
    (platform() === "win32"
      ? join(homedir(), ".stockix", "tenants")
      : "/opt/stockix/tenants");
  const envPath = join(tenantEnvRoot, slug, ".env");

  if (!existsSync(envPath)) {
    console.error("Tenant .env not found:", envPath);
    process.exit(1);
  }

  const tenantVars = parseEnvFile(readFileSync(envPath, "utf8"));
  const bigcapitalRoot =
    tenantVars.BIGCAPITAL_ROOT?.trim() || join(repoRoot, "services/bigcapital");

  const composeFile = join(repoRoot, "infra/tenant-stack/docker-compose.yml");
  const project = composeProjectName(slug);

  const dockerEnv = {
    ...process.env,
    BIGCAPITAL_ROOT: bigcapitalRoot,
  };

  function runMysqlRepair() {
    console.error("\n--- 1) MySQL credentials vs .env (ALTER USER) ---\n");
    execFileSync(
      process.execPath,
      [join(__dirname, "repair-tenant-mysql-auth.mjs"), slug],
      { stdio: "inherit", env: dockerEnv },
    );
  }

  function runNginxBuild() {
    console.error(
      "\n--- 2) Rebuild nginx (Docker DNS / server.template) ---\n",
    );
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "--env-file",
        envPath,
        "build",
        "nginx",
      ],
      { stdio: "inherit", env: dockerEnv },
    );
  }

  function runRebuildAppImages() {
    console.error(
      "\n--- 2b) Rebuild server + webapp + migration images ---\n",
    );
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "--env-file",
        envPath,
        "build",
        "server",
        "webapp",
        "database_migration",
      ],
      { stdio: "inherit", env: dockerEnv },
    );
  }

  function runUpFullStack() {
    console.error(
      "\n--- 3) Force-recreate FULL tenant stack (all compose services) ---\n",
    );
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "--env-file",
        envPath,
        "up",
        "-d",
        "--force-recreate",
      ],
      { stdio: "inherit", env: dockerEnv },
    );
  }

  function runUpLight() {
    console.error(
      "\n--- 3) Recreate server + nginx only (light) ---\n",
    );
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "-p",
        project,
        "--env-file",
        envPath,
        "up",
        "-d",
        "--force-recreate",
        "server",
        "nginx",
      ],
      { stdio: "inherit", env: dockerEnv },
    );
  }

  const curlBin = platform() === "win32" ? "curl.exe" : "curl";

  const pingDeadlineMs = light
    ? 120_000
    : Number(process.env.REPAIR_PING_DEADLINE_MS?.trim()) || 600_000;
  const curlMaxSec = light
    ? "8"
    : String(Number(process.env.REPAIR_CURL_MAX_SEC?.trim()) || 45);

  async function waitForPing() {
    const port = Number(tenantVars.PUBLIC_PROXY_PORT);
    if (!Number.isFinite(port) || port < 1) {
      console.error(
        "PUBLIC_PROXY_PORT missing in tenant .env; skip health wait.",
      );
      return;
    }
    const url = `http://127.0.0.1:${port}/api/ping/`;
    const deadline = Date.now() + pingDeadlineMs;
    console.error(
      "\n--- 4) Wait for API ping ---\n",
      url,
      `(deadline ~${Math.round(pingDeadlineMs / 1000)}s, curl -m ${curlMaxSec}s)`,
    );
    while (Date.now() < deadline) {
      try {
        execFileSync(
          curlBin,
          ["-sf", "-m", curlMaxSec, url],
          { stdio: "ignore", env: dockerEnv },
        );
        console.error("OK: tenant API responds (HTTP 200 on /api/ping/).");
        const base = tenantVars.BASE_URL?.trim();
        if (base) console.error("Public BASE_URL:", base);
        return;
      } catch {
        /* retry */
      }
      await sleep(2000);
    }
    console.error(
      "Timeout: /api/ping/ did not return 200 after",
      pingDeadlineMs,
      "ms. Check:\n  docker logs " + project + "-server-1\n  docker logs " + project + "-nginx-1\n  pnpm repair:tenant-mysql -- " + slug,
    );
    process.exit(1);
  }

  if (!skipMysql) {
    runMysqlRepair();
  } else {
    console.error("Skipped MySQL repair (--skip-mysql).");
  }

  if (!noNginxBuild) {
    runNginxBuild();
  } else {
    console.error("Skipped nginx build (--no-nginx-build).");
  }

  if (rebuildImages) {
    runRebuildAppImages();
  }

  if (light) {
    runUpLight();
  } else {
    runUpFullStack();
  }

  await waitForPing();

  console.error(
    "\nRepair finished. If ping still fails: docker compose logs for project " +
      project +
      "; align DB_PASSWORD with MySQL volume (repair:tenant-mysql).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
