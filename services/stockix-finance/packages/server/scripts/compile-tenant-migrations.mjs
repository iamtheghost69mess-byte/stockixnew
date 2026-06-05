/**
 * Compile tenant Knex migration .ts files to .js for the production server image.
 * Webpack bundle only loads .js migrations (TenancyDB.module loadExtensions).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(serverRoot, "src/database/tenant/migrations");

let compiled = 0;
for (const name of readdirSync(migrationsDir)) {
  if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
  const sourcePath = join(migrationsDir, name);
  const source = readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  writeFileSync(join(migrationsDir, name.replace(/\.ts$/, ".js")), outputText);
  compiled += 1;
}
console.log(`[compile-tenant-migrations] wrote ${compiled} .js files to ${migrationsDir}`);
