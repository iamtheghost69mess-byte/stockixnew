import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "terminals",
  "agent-transcripts",
  "mcps",
]);

const TOOLING_ENV_ALLOWLIST = new Set([
  "services/stockix-finance/packages/webapp/craco.config.js",
  "services/stockix-finance/packages/server/scripts/webpack.common.js",
  "services/stockix-finance/playwright.config.ts",
  "packages/db/src/index.ts", // db package reads its own pool-tuning env vars
  "packages/shared/src/structured-logger.ts", // logger reads NODE_ENV; importing @repo/config would create a circular dep
  "services/pms/frontend/lib/pms-client.ts", // Next.js NEXT_PUBLIC_ vars are bundled at build time — not a runtime config concern
  "services/pms/src/index.ts", // PMS server entrypoint reads CORS_ALLOWED_ORIGINS at startup
  "apps/dashboard/instrumentation.ts", // NEXT_RUNTIME is a Next.js framework variable, not a runtime config concern
]);

const violations = [];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

function shouldScanForRuntimeEnv(filePath) {
  const inRuntimeTree =
    filePath.startsWith("apps/") ||
    filePath.startsWith("packages/") ||
    filePath.startsWith("services/");
  if (!inRuntimeTree) return false;
  if (filePath.startsWith("packages/config/")) return false;
  if (filePath.includes("/scripts/")) return false;
  if (filePath.includes("/e2e/")) return false;
  if (path.basename(filePath) === "playwright.config.ts") return false;
  if (TOOLING_ENV_ALLOWLIST.has(filePath)) return false;
  // Build artifacts
  if (filePath.includes("/.tmp-worker/")) return false;
  // Test directories and test files
  if (/\/tests?\//.test(filePath)) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)) return false;
  // Build/bundler config files (vite.config.ts, next.config.mjs, etc.)
  if (/\.(config)\.[cm]?[jt]sx?$/.test(filePath)) return false;
  // Config directories — these ARE the proper env abstraction layer
  if (/\/config\//.test(filePath)) return false;
  // Dev-only directories
  if (/\/(scratch|tools)\//.test(filePath)) return false;
  // Migration files
  if (/\/migrations?\//.test(filePath)) return false;
  // Env abstraction helpers — they read process.env by design
  if (new Set(["require-env.ts","require-env.js","deployment-secrets.ts","deployment-secrets.js","bootstrap-decrypt-env.ts"]).has(path.basename(filePath))) return false;
  // Bootstrap/entrypoint directories
  if (/\/(entrypoints|bootstrap)\//.test(filePath)) return false;
  // Legacy independent services that pre-date this governance rule and have their own env patterns
  if (filePath.startsWith("services/stockix-finance/")) return false;
  if (filePath.startsWith("services/posnew/")) return false;
  if (filePath.startsWith("services/chatlive/")) return false;
  return true;
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const abs = path.resolve(repoRoot, path.dirname(fromFile), specifier);
  const rel = toPosix(path.relative(repoRoot, abs));
  return rel;
}

function checkProcessEnv(filePath, content) {
  if (!shouldScanForRuntimeEnv(filePath)) return;
  if (/process\.env\b/.test(content)) {
    violations.push(`[env-boundary] ${filePath}: direct process.env is forbidden in runtime layers`);
  }
}

function checkConfigLeaf(filePath, specifier, resolved) {
  if (!filePath.startsWith("packages/config/")) return;
  const raw = resolved ?? specifier;
  if (
    raw.startsWith("apps/") ||
    raw.startsWith("infra/") ||
    raw.startsWith("services/") ||
    raw.startsWith("packages/db/") ||
    specifier === "@repo/db" ||
    specifier.startsWith("@repo/db/")
  ) {
    violations.push(`[config-leaf] ${filePath}: forbidden import "${specifier}"`);
  }
}

function checkCrossLayerImports(filePath, specifier, resolved) {
  const raw = resolved ?? specifier;

  if (filePath.startsWith("apps/dashboard/")) {
    if (specifier === "@repo/db" || specifier.startsWith("@repo/db/") || raw.startsWith("packages/db/")) {
      violations.push(`[dashboard-db] ${filePath}: forbidden import "${specifier}"`);
    }
  }

  if (filePath.startsWith("apps/")) {
    if (raw.startsWith("infra/")) {
      // Tests that integration-test cross-boundary code are exempt
      if (/\/tests?\//.test(filePath) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)) {
        // exempt
      } else {
        violations.push(`[apps-infra] ${filePath}: apps cannot import infra ("${specifier}")`);
      }
    }

    const appMatch = filePath.match(/^apps\/([^/]+)\//);
    const targetMatch = raw.match(/^apps\/([^/]+)\//);
    if (appMatch && targetMatch && appMatch[1] !== targetMatch[1]) {
      violations.push(`[apps-cross-app] ${filePath}: cross-app import forbidden ("${specifier}")`);
    }
  }

  if (filePath.startsWith("infra/") && raw.startsWith("apps/")) {
    // worker-service is the background runner for apps/api — intentional coupling
    if (filePath.startsWith("infra/worker-service/") && raw.startsWith("apps/api/")) {
      // exempt
    } else {
      violations.push(`[infra-apps] ${filePath}: infra cannot import apps ("${specifier}")`);
    }
  }

  if (filePath.startsWith("packages/") && !filePath.startsWith("packages/config/") && raw.startsWith("infra/")) {
    violations.push(`[packages-infra] ${filePath}: packages cannot import infra ("${specifier}")`);
  }
}

function collectImportSpecifiers(content) {
  const specs = [];
  const importExportRegex = /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
  const sideEffectRegex = /\bimport\s*["']([^"']+)["']/g;
  const requireRegex = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

  for (const regex of [importExportRegex, sideEffectRegex, requireRegex]) {
    let match;
    while ((match = regex.exec(content))) {
      specs.push(match[1]);
    }
  }
  return specs;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = toPosix(path.relative(repoRoot, abs));
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walk(abs);
      continue;
    }
    if (!entry.isFile() || !isCodeFile(rel)) continue;

    const content = await readFile(abs, "utf8");
    checkProcessEnv(rel, content);
    const specs = collectImportSpecifiers(content);
    for (const spec of specs) {
      const resolved = resolveRelativeImport(rel, spec);
      checkConfigLeaf(rel, spec, resolved);
      checkCrossLayerImports(rel, spec, resolved);
    }
  }
}

await walk(repoRoot);

if (violations.length) {
  console.error("Boundary violations found:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Boundary checks passed.");
