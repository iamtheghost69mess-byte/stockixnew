#!/usr/bin/env node
/**
 * CI guard: every /tenants/:tenantId route must call tenantWithinOwnerScope
 * or assertTenantInOwnerScope in the handler body.
 *
 * Scans every .ts file under src/routes/ (recursively, excluding *.test.ts)
 * plus src/index.ts, instead of a hardcoded file list — a prior version
 * hardcoded "routes/tenants.ts" and silently stopped checking anything once
 * that file was renamed to routes/tenants-shared.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");

function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = [
  join(srcRoot, "index.ts"),
  ...collectTsFiles(join(srcRoot, "routes")),
];

const routeRe =
  /app\.(get|post|patch|delete|put)\(\s*["'`](\/tenants\/:tenantId[^"'`]*)["'`]/g;

/** Extracts the arrow-function handler body starting at `from` by counting braces. */
function extractHandlerBody(source, from) {
  const arrowStart = source.indexOf("=>", from);
  if (arrowStart === -1) return "";
  const braceStart = source.indexOf("{", arrowStart);
  if (braceStart === -1 || braceStart - arrowStart > 20) return "";

  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return source.slice(braceStart);
}

const GUARD_CALLS = ["tenantWithinOwnerScope(", "assertTenantInOwnerScope("];

function bodyCallsGuardDirectly(body) {
  return GUARD_CALLS.some((g) => body.includes(g));
}

/** Local `async function name(...) { ... }` and `function name(...) { ... }` bodies, by name. */
function collectLocalFunctionBodies(source) {
  const bodies = new Map();
  const fnRe = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = fnRe.exec(source)) !== null) {
    const name = m[1];
    const parenStart = source.indexOf("(", fnRe.lastIndex - m[0].length + m[0].indexOf("("));
    const braceStart = source.indexOf("{", parenStart);
    if (braceStart === -1) continue;
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.set(name, source.slice(braceStart, i + 1));
          break;
        }
      }
    }
  }
  return bodies;
}

/** Handler is protected if it calls the guard directly, or calls a local wrapper
 * function (one level of indirection) whose own body calls the guard directly. */
function isProtected(body, localFunctionBodies) {
  if (bodyCallsGuardDirectly(body)) return true;
  const callRe = /([A-Za-z0-9_]+)\(/g;
  let m;
  while ((m = callRe.exec(body)) !== null) {
    const fnBody = localFunctionBodies.get(m[1]);
    if (fnBody && bodyCallsGuardDirectly(fnBody)) return true;
  }
  return false;
}

const routes = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const relPath = relative(srcRoot, file);
  const localFunctionBodies = collectLocalFunctionBodies(source);
  let match;
  routeRe.lastIndex = 0;
  while ((match = routeRe.exec(source)) !== null) {
    const path = match[2];
    const body = extractHandlerBody(source, routeRe.lastIndex);
    const hasScope = isProtected(body, localFunctionBodies);
    routes.push({ file: relPath, path, hasScope });
  }
}

const failing = routes.filter((r) => !r.hasScope);
const passing = routes.filter((r) => r.hasScope);

console.log(`Tenant scope audit: ${passing.length} passed, ${failing.length} failed`);
for (const r of passing) {
  console.log(`  OK  ${r.file}  ${r.path}`);
}
for (const r of failing) {
  console.error(`  FAIL ${r.file}  ${r.path}`);
}

if (routes.length === 0) {
  console.error("Tenant scope audit found zero /tenants/:tenantId routes — the scan is" +
    " almost certainly broken (wrong root, or the route pattern changed). Failing closed.");
  process.exit(1);
}

if (failing.length > 0) {
  process.exit(1);
}
