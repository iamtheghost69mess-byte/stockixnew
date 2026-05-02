/**
 * Production-safe: align the MySQL application user password with the tenant `.env`
 * (DB_PASSWORD) using the root account (DB_ROOT_PASSWORD) — no volume wipe.
 *
 * Use when `database_migration` fails with ER_ACCESS_DENIED / "Access denied for user"
 * after the MySQL volume was initialized with different secrets than the current .env.
 *
 *   pnpm repair:tenant-mysql -- <slug>
 *   STOCKIX_TENANT_SLUG=<slug> pnpm repair:tenant-mysql
 *
 * Optional: TENANT_ENV_ROOT=... (defaults: %USERPROFILE%\.stockix\tenants on Windows, /opt/stockix/tenants elsewhere)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
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

/** Escape single quotes for SQL string literals */
function escapeSqlString(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function composeProjectName(slug) {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

let slug = process.env.STOCKIX_TENANT_SLUG?.trim();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--slug=")) slug = a.slice(7).trim();
  else if (!a.startsWith("-") && slug === undefined) slug = a;
}

if (!slug) {
  console.error("Usage: pnpm repair:tenant-mysql -- <tenant-slug>");
  console.error("   or: STOCKIX_TENANT_SLUG=<slug> pnpm repair:tenant-mysql");
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

const envVars = parseEnvFile(readFileSync(envPath, "utf8"));
const dbUser = envVars.DB_USER || "bigcapital";
const dbPassword = envVars.DB_PASSWORD;
const dbRootPassword = envVars.DB_ROOT_PASSWORD;
const bigcapitalRoot =
  envVars.BIGCAPITAL_ROOT?.trim() || join(repoRoot, "services/bigcapital");

if (!dbPassword || !dbRootPassword) {
  console.error(
    "DB_PASSWORD and DB_ROOT_PASSWORD must be present in",
    envPath,
  );
  process.exit(1);
}

const composeFile = join(repoRoot, "infra/tenant-stack/docker-compose.yml");
const project = composeProjectName(slug);

const u = escapeSqlString(dbUser);
const p = escapeSqlString(dbPassword);

/** Prefer '%' then 'localhost' — one may not exist depending on image defaults */
const statements = [
  `ALTER USER '${u}'@'%' IDENTIFIED BY '${p}';`,
  `ALTER USER '${u}'@'localhost' IDENTIFIED BY '${p}';`,
  "FLUSH PRIVILEGES;",
];

const dockerEnv = { ...process.env, BIGCAPITAL_ROOT: bigcapitalRoot };

function runMysql(sql) {
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
      "exec",
      "-T",
      "mysql",
      "mysql",
      "-uroot",
      `-p${dbRootPassword}`,
      "-e",
      sql,
    ],
    { stdio: "inherit", env: dockerEnv },
  );
}

console.error(`Repair MySQL app user for project ${project} (tenant ${slug})…`);

let ok = false;
for (const stmt of statements.slice(0, 2)) {
  try {
    runMysql(stmt);
    ok = true;
  } catch {
    /* host variant may not exist */
  }
}

if (!ok) {
  console.error(
    "ALTER USER failed for both @'%' and @'localhost'. Check DB_ROOT_PASSWORD matches this volume, or MySQL is down.",
  );
  process.exit(1);
}

try {
  runMysql(statements[2]);
} catch (e) {
  console.error("FLUSH PRIVILEGES failed:", e);
  process.exit(e.status ?? 1);
}

console.error(
  "Done. Application user password now matches DB_PASSWORD in tenant .env. Re-run database_migration or provision.",
);
