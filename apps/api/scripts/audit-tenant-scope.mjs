#!/usr/bin/env node
/**
 * CI guard: every /tenants/:tenantId route must call tenantWithinOwnerScope
 * or assertTenantInOwnerScope in the handler body.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const source = ["index.ts", "routes/tenants.ts"]
  .map((f) => readFileSync(join(srcRoot, f), "utf8"))
  .join("\n");

const routeRe =
  /app\.(get|post|patch|delete|put)\(\s*["'`]\/tenants\/:tenantId[^"'`]*["'`]/g;

const routes = [];
let match;
while ((match = routeRe.exec(source)) !== null) {
  const routeStart = match.index;
  const pathMatch = source.slice(routeStart).match(/["'`](\/tenants\/:tenantId[^"'`]*)["'`]/);
  const path = pathMatch?.[1] ?? "/tenants/:tenantId";
  const handlerStart = source.indexOf("async (c)", routeStart);
  if (handlerStart === -1) continue;
  const handlerSlice = source.slice(handlerStart, handlerStart + 2500);
  const hasScope =
    handlerSlice.includes("tenantWithinOwnerScope(") ||
    handlerSlice.includes("assertTenantInOwnerScope(");
  routes.push({ path, hasScope });
}

const failing = routes.filter((r) => !r.hasScope);
const passing = routes.filter((r) => r.hasScope);

console.log(`Tenant scope audit: ${passing.length} passed, ${failing.length} failed`);
for (const r of passing) {
  console.log(`  OK  ${r.path}`);
}
for (const r of failing) {
  console.error(`  FAIL ${r.path}`);
}

if (failing.length > 0) {
  process.exit(1);
}
