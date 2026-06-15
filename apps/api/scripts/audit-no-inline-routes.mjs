#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const indexPath = join(dirname(fileURLToPath(import.meta.url)), "../src/index.ts");
const source = readFileSync(indexPath, "utf8");
const matches = [...source.matchAll(/app\.(get|post|patch|delete|put)\s*\(/g)];

if (matches.length > 0) {
  console.error(`FAIL: index.ts has ${matches.length} inline route handler(s)`);
  process.exit(1);
}

console.log("OK: index.ts has no inline app.get/post/patch/delete/put handlers");
