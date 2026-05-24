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
  if (TOOLING_ENV_ALLOWLIST.has(filePath)) return false;
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
      violations.push(`[apps-infra] ${filePath}: apps cannot import infra ("${specifier}")`);
    }

    const appMatch = filePath.match(/^apps\/([^/]+)\//);
    const targetMatch = raw.match(/^apps\/([^/]+)\//);
    if (appMatch && targetMatch && appMatch[1] !== targetMatch[1]) {
      violations.push(`[apps-cross-app] ${filePath}: cross-app import forbidden ("${specifier}")`);
    }
  }

  if (filePath.startsWith("infra/") && raw.startsWith("apps/")) {
    violations.push(`[infra-apps] ${filePath}: infra cannot import apps ("${specifier}")`);
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
