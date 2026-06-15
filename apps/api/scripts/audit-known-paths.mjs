#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const knownPathFile = join(srcRoot, "middleware/known-api-paths.ts");
const knownSource = readFileSync(knownPathFile, "utf8");
const prefixes = [...knownSource.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "webhooks") walk(p, files);
      else if (p.includes("routes")) walk(p, files);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      files.push(p);
    }
  }
  return files;
}

const routeFiles = walk(join(srcRoot, "routes"));
const pathRe = /app\.(?:get|post|patch|delete|put|all)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const found = new Set();

for (const file of routeFiles) {
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = pathRe.exec(text)) !== null) {
    found.add(m[1].split(":")[0]);
  }
}

const failing = [];
for (const path of found) {
  if (path === "/health" || path === "/ready") continue;
  const ok = prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
  if (!ok) failing.push(path);
}

if (failing.length > 0) {
  console.error("FAIL: routes not covered by known-api-paths.ts:");
  for (const p of failing.sort()) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`OK: ${found.size} route path(s) covered by known-api-paths.ts`);
