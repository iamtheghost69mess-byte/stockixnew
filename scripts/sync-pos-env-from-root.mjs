#!/usr/bin/env node
/**
 * POS backend env sync — no-op since migration to root .env.
 *
 * POS backend (apps/pos-backend) now loads from the repo root .env directly
 * via loadEnvIfDev({ path: <root>/.env }) in config/config.js and all workers.
 * There is no longer a separate apps/pos-backend/.env file.
 *
 * This script is kept so existing npm run / pnpm invocations don't break.
 * It exits 0 immediately.
 */
console.log("✓ POS backend reads from root .env directly — no sync needed.");
process.exit(0);
