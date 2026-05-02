/**
 * Install Stockix development env files from committed `env/development/` templates.
 *
 *   pnpm bootstrap:env           copy only if destination is missing
 *   pnpm bootstrap:env -- --force   overwrite
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const force = process.argv.includes("--force");

const copies = [
  ["env/development/root.env", ".env"],
  ["env/development/db.env", "packages/db/.env"],
  ["env/development/apps-api.env", "apps/api/.env"],
  ["env/development/dashboard.env", "apps/dashboard/.env.local"],
  ["env/development/vps-postgres.env", "infra/vps/.env"],
];

let created = 0;
let updated = 0;
for (const [relSrc, relDest] of copies) {
  const src = path.join(root, relSrc);
  const dest = path.join(root, relDest);
  if (!existsSync(src)) {
    console.warn("Skip (missing source):", relSrc);
    continue;
  }
  if (existsSync(dest) && !force) {
    console.log("Exists (use --force to overwrite):", relDest);
    continue;
  }
  copyFileSync(src, dest);
  if (existsSync(dest) && force) {
    console.log("Overwrote:", relDest, "←", relSrc);
    updated += 1;
  } else {
    console.log("Created:", relDest, "←", relSrc);
    created += 1;
  }
}

if (created + updated > 0) {
  console.log(
    "\nDevelopment env installed from env/development/*. Matches infra/dev/docker-compose.yml (platform Postgres :54330).",
  );
  console.log(
    "Keep DATABASE_URL identical in .env, packages/db/.env, and apps/api/.env (platform Postgres — not tenant MySQL).",
  );
  if (!force && created === 0) {
    console.log("Tip: pnpm bootstrap:env -- --force  to refresh.");
  }
}
process.exit(0);
