/**
 * Bootstrap the local development environment.
 *
 * Single source of truth: repo root .env
 *   - Control-plane API and Dashboard already load from root .env via @repo/config.
 *   - POS backend now also loads from root .env (updated in config.js).
 *   - Finance tenant containers receive env from Docker Compose at provisioning time.
 *
 * After running this, call `pnpm env:pos-vars` to ensure POS-specific dev vars
 * are also in root .env, then `pnpm env:validate` to verify completeness.
 *
 * Usage:
 *   pnpm bootstrap:env              — copy root .env.example → .env (skip if exists)
 *   pnpm bootstrap:env -- --force   — overwrite from .env.example
 *   pnpm setup:local                — full one-shot setup (bootstrap + validate + db)
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const force = process.argv.includes("--force");

// ── Single canonical pair: root .env.example → root .env ────────────────────
const src = path.join(repoRoot, ".env.example");
const dest = path.join(repoRoot, ".env");

if (!existsSync(src)) {
  console.error("Missing .env.example at repo root — cannot bootstrap.");
  process.exit(1);
}

if (existsSync(dest) && !force) {
  console.log("Root .env already exists (use --force to overwrite from .env.example).");
} else {
  copyFileSync(src, dest);
  console.log(force ? "Overwrote root .env ← .env.example" : "Created root .env ← .env.example");
}

// ── DB package — Prisma needs DATABASE_URL in its working directory ──────────
const dbSrc = path.join(repoRoot, "packages", "db", ".env.example");
const dbDest = path.join(repoRoot, "packages", "db", ".env");
if (existsSync(dbSrc)) {
  if (!existsSync(dbDest) || force) {
    copyFileSync(dbSrc, dbDest);
    console.log(force ? "Overwrote packages/db/.env" : "Created packages/db/.env");
  }
}

console.log(`
Next steps:
  pnpm env:secrets      — generate cryptographic secrets and paste into root .env
  pnpm env:pos-vars     — add POS backend dev vars to root .env
  pnpm env:validate     — verify all required vars are set
  pnpm env:align-local  — fill internal host / POS port keys
  pnpm db:up            — start databases
  pnpm db:migrate       — run migrations

Or run everything at once:
  pnpm setup:local
`);
process.exit(0);
