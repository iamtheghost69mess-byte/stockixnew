/**
 * Copy *.env.example → real env files for local testing.
 *
 *   pnpm bootstrap:env           copy only if destination is missing
 *   pnpm bootstrap:env -- --force   overwrite from examples (local testing)
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const force = process.argv.includes("--force");

const copies = [
  [".env.example", ".env"],
  ["packages/db/.env.example", "packages/db/.env"],
  ["apps/api/.env.example", "apps/api/.env"],
  ["apps/dashboard/.env.example", "apps/dashboard/.env.local"],
  ["services/stockix-finance/.env.example", "services/stockix-finance/.env"],
];

let created = 0;
let updated = 0;
for (const [relSrc, relDest] of copies) {
  const src = path.join(root, relSrc);
  const dest = path.join(root, relDest);
  if (!existsSync(src)) {
    console.warn("Skip (missing example):", relSrc);
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
    "\nLocal env synced from *.env.example. Values match infra/dev/docker-compose.yml.",
  );
  if (!force && created === 0) {
    console.log("Tip: pnpm bootstrap:env -- --force  to refresh from templates.");
  }
}
process.exit(0);
