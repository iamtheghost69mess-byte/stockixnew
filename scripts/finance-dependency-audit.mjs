#!/usr/bin/env node
/**
 * Dependency hygiene gate for Finance server — flags legacy packages still referenced in live code.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const FINANCE_SERVER = path.join(root, "services/stockix-finance/packages/server");
const SCAN_ROOT = path.join(FINANCE_SERVER, "src/modules");
const PKG = path.join(FINANCE_SERVER, "package.json");

const LEGACY_PACKAGES = [
  {
    name: "typedi",
    allowPaths: [],
    reason: "typedi removed — use Nest DI",
  },
];

const violations = [];

function posix(p) {
  return p.split(path.sep).join("/");
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isAllowed(rel, allowPaths) {
  return allowPaths.some((p) => rel.includes(p.replace(/^src\//, "")));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(abs);
    else if (e.isFile() && abs.endsWith(".ts")) await scanFile(abs);
  }
}

async function scanFile(file) {
  const relFromServer = posix(path.relative(FINANCE_SERVER, file));
  const content = stripComments(await readFile(file, "utf8"));

  for (const { name, allowPaths, reason } of LEGACY_PACKAGES) {
    if (!content.includes(name)) continue;
    if (relFromServer.startsWith("src/modules/") && name === "typedi") {
      if (/\bfrom\s+['"]typedi['"]/.test(content) || /\bContainer\.get\b/.test(content)) {
        violations.push({ file: relFromServer, reason });
      }
      continue;
    }
    if (!isAllowed(relFromServer, allowPaths)) {
      violations.push({ file: relFromServer, reason: `${reason} (${name})` });
    }
  }
}

if (!existsSync(PKG)) {
  console.error("Finance server package.json not found");
  process.exit(1);
}

const pkg = JSON.parse(await readFile(PKG, "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const ORPHAN_DEPS = ["csurf", "agendash"];
for (const dep of ORPHAN_DEPS) {
  if (deps[dep]) {
    violations.push({
      file: "package.json",
      reason: `legacy dependency still declared: ${dep} (audit for removal)`,
    });
  }
}

await walk(SCAN_ROOT);

console.log("FINANCE DEPENDENCY AUDIT");
console.log("------------------------");
if (!violations.length) {
  console.log("PASS — no dependency hygiene violations in Nest modules");
  process.exit(0);
}

console.log(`WARN/FAIL — ${violations.length} finding(s):\n`);
for (const v of violations) {
  console.log(`- ${v.file}: ${v.reason}`);
}

// Package.json orphans are warnings; Nest module typedi is hard fail.
const hardFail = violations.some((v) => v.file.startsWith("src/modules/"));
process.exit(hardFail ? 1 : 0);
