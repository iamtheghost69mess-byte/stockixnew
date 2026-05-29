/**
 * Copy *.env.example → real env files for local testing.
 *
 * API + Dashboard both load from repo root via @repo/config (see packages/config, dashboard next.config).
 * Do not use apps/api/.env or apps/dashboard/.env — they are ignored by runtime and cause drift.
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
  ["services/stockix-finance/.env.example", "services/stockix-finance/.env"],
  [
    "services/stockix-finance/packages/server/.env.example",
    "services/stockix-finance/packages/server/.env",
  ],
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
    "\nLocal env synced from *.env.example. API and dashboard read repo root `.env` + `.env.local` only.",
  );
  if (!force && created === 0) {
    console.log("Tip: pnpm bootstrap:env -- --force  to refresh from templates.");
  }
}
console.log(
  "\nOptional: copy `.env` → `.env.local` and put machine-only overrides there (gitignored).",
);
process.exit(0);
