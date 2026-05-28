#!/usr/bin/env node
/**
 * Local mirror of .github/workflows/deploy.yml quality-gate job.
 * Usage: node scripts/quality-gate-local.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWin = process.platform === "win32";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const financeRoot = path.join(root, "services/stockix-finance");
const financeServer = path.join(financeRoot, "packages/server");

function gitLsFiles() {
  const r = spawnSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error("git ls-files failed:", r.stderr || r.error?.message || "unknown");
    process.exit(r.status ?? 1);
  }
  return (r.stdout ?? "").split(/\r?\n/).filter(Boolean);
}

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  CI: "true",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/stockix_test",
  SESSION_SECRET: "test-session-secret-32-chars-minimum-length",
  AUTH_TOKEN_SECRET: "test-auth-token-secret-32-chars-minimum",
  PLATFORM_API_SECRET: "test-platform-api-secret-32-chars-minimum",
  INTERNAL_API_SECRET: "ci-internal-secret-placeholder",
  DEPLOYMENT_SECRET_KEY: "test-deployment-secret-key-32-chars-min",
  LICENSE_SIGNING_SECRET: "test-license-signing-secret-32-chars-min",
  WORKER_SECRET: "test-worker-secret-32-chars-minimum-length",
  POS_PLATFORM_BASE_URL: "http://127.0.0.1:8010",
  POS_FRONTEND_URL: "http://127.0.0.1:3001",
  PMS_BASE_URL: "http://127.0.0.1:3003",
  STOCKIX_FINANCE_INTERNAL_HOST: "127.0.0.1",
};

function run(name, cmd, args, opts = {}) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    env: opts.env ?? process.env,
    stdio: "inherit",
    shell: isWin,
  });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${name} (exit ${r.status ?? "signal"})`);
    process.exit(r.status ?? 1);
  }
  console.log(`OK: ${name}`);
}

function sh(name, script, opts = {}) {
  run(name, isWin ? "cmd" : "sh", isWin ? ["/c", script] : ["-c", script], opts);
}

function financeDepsReady() {
  return existsSync(path.join(financeServer, "node_modules/jest"));
}

function ensureFinanceDeps() {
  const env = { ...testEnv, HUSKY: "0" };
  const maxAttempts = isWin ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n=== Finance install${attempt > 1 ? ` (${attempt}/${maxAttempts})` : ""} ===`);
    const r = spawnSync("pnpm", ["install", "--frozen-lockfile"], {
      cwd: financeRoot,
      env,
      stdio: "inherit",
      shell: isWin,
    });
    if (r.status === 0) {
      console.log("OK: Finance install");
      return;
    }
    if (attempt < maxAttempts) {
      console.warn(`Finance install failed (exit ${r.status ?? "signal"}), retrying...`);
    }
  }

  if (financeDepsReady()) {
    console.warn(
      "WARN: Finance install failed but server node_modules look usable; continuing with tests.",
    );
    return;
  }

  console.error("\nFAILED: Finance install");
  process.exit(1);
}

function buildFinanceSharedPackages() {
  run(
    "Finance shared build",
    "pnpm",
    [
      "run",
      "build",
      "--scope",
      "@stockix/utils",
      "--scope",
      "@stockix/email-components",
      "--scope",
      "@stockix/pdf-templates",
    ],
    { cwd: financeRoot, env: { ...testEnv, HUSKY: "0" } },
  );
}

console.log("Stockix quality gate (local CI mirror)");
console.log(`Root: ${root}`);

run("Install", "pnpm", ["install", "--frozen-lockfile"]);
ensureFinanceDeps();
buildFinanceSharedPackages();
sh("Security audit", "pnpm audit --prod --audit-level=high");
sh(
  "Build workspace packages",
  "pnpm --filter @repo/auth build && pnpm --filter @repo/config build && pnpm --filter @repo/db build && pnpm --filter @repo/shared build",
);
{
  const trackedEnv = gitLsFiles().filter(
    (f) => /(^|\/)\.env($|(\.[^/]+)$)/.test(f) && !/\.env\.example$/.test(f),
  );
  console.log("\n=== Hygiene — no tracked .env ===");
  if (trackedEnv.length > 0) {
    console.error("Tracked .env files are not allowed:");
    for (const f of trackedEnv) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("OK: Hygiene — no tracked .env");
}
{
  const trackedArtifacts = gitLsFiles().filter((f) =>
    /(^|\/)(\.next\/|dist\/|build\/|coverage\/|\.runtime\/|\.tmp-worker\/)/.test(f),
  );
  console.log("\n=== Hygiene — no tracked artifacts ===");
  if (trackedArtifacts.length > 0) {
    console.error("Tracked generated artifacts are not allowed:");
    for (const f of trackedArtifacts) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("OK: Hygiene — no tracked artifacts");
}

run("Type check API", "pnpm", ["--filter", "api", "exec", "tsc", "--noEmit"]);
run("Type check Worker", "npx", ["tsc", "--noEmit"], {
  cwd: path.join(root, "infra/worker-service"),
});
run("Type check Dashboard", "pnpm", ["--filter", "dashboard", "exec", "tsc", "--noEmit"]);
sh(
  "Type check packages",
  "pnpm --filter @repo/auth exec tsc --noEmit && pnpm --filter @repo/config exec tsc --noEmit && pnpm --filter @repo/db exec tsc --noEmit && pnpm --filter @repo/shared exec tsc --noEmit",
);
run("Type check PMS", "pnpm", ["--filter", "@stockix/pms", "exec", "tsc", "--noEmit"]);

run("Tenant scope", "pnpm", ["--filter", "api", "check:tenant-scope"]);
sh(
  "API route registry",
  "pnpm --filter api check:routes && pnpm --filter api check:known-paths && pnpm --filter api check:api-structure",
);

for (let i = 1; i <= 5; i++) {
  run(`License stability ${i}/5`, "pnpm", [
    "--filter",
    "api",
    "exec",
    "vitest",
    "run",
    "tests/license-single-active.test.ts",
  ], { env: testEnv });
}

run("API tests", "pnpm", ["--filter", "api", "test"], { env: testEnv });
run("Dashboard tests", "pnpm", ["--filter", "dashboard", "run", "test", "--", "--run"], {
  env: testEnv,
});
run("PMS tests", "pnpm", ["--filter", "@stockix/pms", "run", "test", "--", "--run"], {
  env: testEnv,
});
run("POS tests", "npm", ["run", "test:ci"], {
  cwd: path.join(root, "services/posnew/apps/pos-backend"),
  env: { ...testEnv, RUN_RBAC_ORG_ISOLATION: "0", REDIS_URL: "", MONGODB_URI: "" },
});
run("Finance tests", "pnpm", ["test"], {
  cwd: financeServer,
  env: { ...testEnv, CI: "true" },
});

run("Build API", "pnpm", ["--filter", "api", "build"]);
run("Build worker", "pnpm", ["infra:worker:build"]);
run("Build dashboard", "pnpm", ["--filter", "dashboard", "build"]);

if (!existsSync(path.join(root, "apps/dashboard/.next/static"))) {
  console.error("FAIL: dashboard .next/static missing after build");
  process.exit(1);
}

run("Architecture boundaries", "pnpm", ["lint:boundaries"]);
run("Architecture validate", "pnpm", ["architecture:validate"]);

console.log("\n========================================");
console.log("QUALITY GATE PASSED (local CI mirror)");
console.log("========================================\n");
