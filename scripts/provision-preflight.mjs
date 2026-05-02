#!/usr/bin/env node
/**
 * Readiness check before provisioning (no tenant created). Run API optional for HTTP checks.
 *
 *   pnpm provision:preflight
 *
 * Env:
 *   STOCKIX_API_URL   default http://localhost:4000
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function loadApiEnvVar(key) {
  for (const rel of ["apps/api/.env.local", "apps/api/.env"]) {
    const p = join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (k !== key) continue;
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return process.env[key]?.trim() ?? "";
}

process.env.DATABASE_URL = process.env.DATABASE_URL || loadApiEnvVar("DATABASE_URL");

const API = (process.env.STOCKIX_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

function ok(msg) {
  console.log("✓", msg);
}

function warn(msg) {
  console.warn("⚠", msg);
}

function fail(msg) {
  console.error("✗", msg);
}

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "pipe", encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Stockix provision preflight\n");

  let errors = 0;

  const composeFile = join(repoRoot, "infra/tenant-stack/docker-compose.yml");
  if (!existsSync(composeFile)) {
    fail(`Missing ${composeFile}`);
    errors++;
  } else {
    ok(`Compose file present (${composeFile})`);
  }

  const bcRoot =
    process.env.BIGCAPITAL_ROOT?.trim() ||
    join(repoRoot, "services/bigcapital");
  const serverDf = join(bcRoot, "packages/server/Dockerfile");
  if (!existsSync(serverDf)) {
    fail(`BIGCAPITAL_ROOT invalid (no packages/server/Dockerfile): ${bcRoot}`);
    errors++;
  } else {
    ok(`BIGCAPITAL_ROOT OK → ${bcRoot}`);
  }

  if (!dockerAvailable()) {
    fail("Docker daemon not reachable (start Docker Desktop / dockerd)");
    errors++;
  } else {
    ok("Docker daemon reachable");
    try {
      const v = execFileSync("docker", ["compose", "version"], {
        encoding: "utf8",
      }).trim();
      ok(v);
    } catch {
      warn("docker compose plugin missing?");
      errors++;
    }
  }

  const tenantRoot =
    process.env.TENANT_ENV_ROOT?.trim() ||
    (platform() === "win32"
      ? join(homedir(), ".stockix", "tenants")
      : "/opt/stockix/tenants");
  ok(`TENANT_ENV_ROOT would be ${tenantRoot}`);

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    warn("DATABASE_URL not loaded (apps/api/.env missing or empty) — API cannot provision without platform Postgres.");
    errors++;
  } else {
    ok("DATABASE_URL is set in loaded env");
  }

  console.log("\nHTTP checks (API must be running: pnpm dev or pnpm --filter api dev):\n");

  try {
    const h = await fetch(`${API}/health`);
    if (!h.ok) {
      fail(`GET /health → HTTP ${h.status}`);
      errors++;
    } else {
      ok(`GET /health → ${JSON.stringify(await h.json())}`);
    }
  } catch (e) {
    warn(`Cannot reach API at ${API} — ${e?.message ?? e}`);
    warn("Start the API, then re-run preflight.");
    errors++;
  }

  try {
    const oRes = await fetch(`${API}/owners`);
    const o = await oRes.json().catch(() => ({}));
    if (!oRes.ok) {
      fail(`GET /owners → HTTP ${oRes.status}`);
      errors++;
    } else {
      const n = o.owners?.length ?? 0;
      if (n === 0) {
        warn("No owners — run: pnpm db:seed:local");
        errors++;
      } else {
        ok(`GET /owners → ${n} owner(s)`);
      }
    }
  } catch (e) {
    warn(`GET /owners failed — ${e?.message ?? e}`);
    errors++;
  }

  console.log(`
Next steps:
  • Full checklist (no image build):  pnpm verify:provision-ready
  • Dry provision-smoke:               pnpm --filter api run provision-smoke
  • Full Docker provision test:        pnpm --filter api run provision-smoke -- --full
  • Wipe local Docker/cache:          pnpm stockix:reset-local --help
`);

  if (errors > 0) {
    console.error(`\nPreflight finished with ${errors} issue(s) — fix above before provisioning.\n`);
    process.exit(1);
  }

  console.log("\nPreflight passed — provisioning prerequisites look OK.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
