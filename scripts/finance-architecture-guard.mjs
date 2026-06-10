#!/usr/bin/env node
/**
 * Finance architecture firewall — fails CI if legacy Express/typedi paths reappear.
 * See finance_production_hardening plan § "architecture-guard.ts".
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const FINANCE_SERVER = path.join(root, "services/stockix-finance/packages/server");
const SCAN_ROOT = path.join(FINANCE_SERVER, "src");
const exts = new Set([".ts", ".tsx"]);
const ignore = new Set(["node_modules", "build", "stubs"]);

const violations = [];

function posix(p) {
  return p.split(path.sep).join("/");
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function add(file, reason) {
  violations.push({ file: posix(path.relative(root, file)), reason });
}

const FORBIDDEN_IMPORT_PATTERNS = [
  { re: /from\s+['"]@\/api\//, reason: "import from @/api/ (legacy Express routes)" },
  { re: /from\s+['"]api\//, reason: "import from api/ (legacy Express routes)" },
  { re: /from\s+['"]@\/services\//, reason: "import from @/services/ (deleted legacy layer)" },
  { re: /from\s+['"]services\//, reason: "import from services/ (deleted legacy layer)" },
  { re: /require\(\s*['"]@\/api\//, reason: "require @/api/" },
  { re: /require\(\s*['"]@\/services\//, reason: "require @/services/" },
];

const FORBIDDEN_PATHS = [
  { rel: "services/stockix-finance/packages/server/src/api", reason: "src/api/ must not exist" },
  { rel: "services/stockix-finance/packages/server/src/services", reason: "src/services/ must not exist" },
  { rel: "services/stockix-finance/packages/server/src/subscribers", reason: "src/subscribers/ must not exist" },
  { rel: "services/stockix-finance/packages/server/src/server.ts", reason: "src/server.ts must not exist" },
  { rel: "services/stockix-finance/packages/server/src/loaders/express.ts", reason: "loaders/express.ts must not exist" },
  { rel: "services/stockix-finance/packages/server/src/loaders/index.ts", reason: "loaders/index.ts must not exist" },
  { rel: "services/stockix-finance/packages/server/src/lib/deployment-secrets.ts", reason: "vendored deployment-secrets.ts must use @repo/shared" },
  { rel: "services/stockix-finance/packages/shared", reason: "duplicate @repo/shared copy — use root packages/shared via workspace" },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(abs);
    else if (e.isFile() && exts.has(path.extname(e.name))) await scanFile(abs);
  }
}

async function scanFile(file) {
  const rel = posix(path.relative(SCAN_ROOT, file));
  const raw = await readFile(file, "utf8");
  const content = stripComments(raw);

  for (const { re, reason } of FORBIDDEN_IMPORT_PATTERNS) {
    if (re.test(content)) add(file, reason);
  }

  if (rel.startsWith("modules/") && /\bContainer\.get\s*\(/.test(content)) {
    add(file, "typedi Container.get in Nest module (use Nest DI)");
  }

  if (rel === "main.ts" && /\bContainer\.set\s*\(/.test(content)) {
    add(file, "typedi Container.set in main.ts bootstrap");
  }

  if (/\bfrom\s+['"]typedi['"]/.test(content) && rel.startsWith("modules/")) {
    if (/@Service\s*\(|@Inject\s*\(\s*\)/.test(content)) {
      add(file, "typedi decorators in active Nest module");
    }
  }
}

for (const { rel, reason } of FORBIDDEN_PATHS) {
  if (existsSync(path.join(root, rel))) {
    violations.push({ file: rel, reason });
  }
}

const pkgJsonPath = path.join(FINANCE_SERVER, "package.json");
if (existsSync(pkgJsonPath)) {
  const pkg = JSON.parse(await readFile(pkgJsonPath, "utf8"));
  if (pkg.main && pkg.main !== "build/index.js") {
    violations.push({
      file: posix(path.relative(root, pkgJsonPath)),
      reason: `package.json main must be build/index.js (got ${pkg.main})`,
    });
  }
}

await walk(SCAN_ROOT);
await scanModuleConstantsBridges();

async function scanModuleConstantsBridges() {
  const modulesDir = path.join(SCAN_ROOT, "modules");
  if (!existsSync(modulesDir)) return;

  const entries = await readdir(modulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const constantsFile = path.join(modulesDir, entry.name, "constants.ts");
    if (!existsSync(constantsFile)) continue;

    const raw = await readFile(constantsFile, "utf8");
    const content = stripComments(raw);

    if (/export\s+const\s+DEFAULT_VIEWS\s*=/.test(content)) {
      add(
        constantsFile,
        "DEFAULT_VIEWS defined locally in module constants — re-export from @/constants",
      );
    }

    if (/export\s+const\s+\w+DefaultViews\s*=/.test(content)) {
      add(
        constantsFile,
        "*DefaultViews defined locally in module constants — re-export DEFAULT_VIEWS from @/constants",
      );
    }
  }
}

console.log("FINANCE ARCHITECTURE GUARD");
console.log("--------------------------");
if (!violations.length) {
  console.log("PASS — no legacy architecture violations");
  process.exit(0);
}

console.log(`FAIL — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.log(`- ${v.file}: ${v.reason}`);
}
process.exit(1);
