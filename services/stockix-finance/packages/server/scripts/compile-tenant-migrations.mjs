/**
 * Compile tenant Knex migration/seed .ts files to .js for the production server image.
 * Rewrites @/ path aliases to relative paths under build/ so native require() works.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(serverRoot, "src");
const buildRoot = join(serverRoot, "build");

const compileOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

function rewriteAliasImports(source, fromDir, aliasRoot) {
  return source.replace(
    /from\s+(['"])@\/([^'"]+)\1/g,
    (_, quote, subpath) => {
      const target = join(aliasRoot, subpath);
      let rel = relative(fromDir, target).replace(/\\/g, "/");
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return `from ${quote}${rel}${quote}`;
    },
  );
}

function compileFile(srcPath, outPath, { rewriteAliases = false } = {}) {
  let source = readFileSync(srcPath, "utf8");
  if (rewriteAliases) {
    source = rewriteAliasImports(source, dirname(outPath), buildRoot);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: compileOptions,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, outputText);
}

function compileTsDir(srcDir, outDir, options = {}) {
  let compiled = 0;
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts")) continue;
    compileFile(join(srcDir, name), join(outDir, name.replace(/\.ts$/, ".js")), options);
    compiled += 1;
  }
  return compiled;
}

// Migrations: compile beside .ts in src (copied to build/database/tenant/migrations in Dockerfile).
const migrationsDir = join(srcRoot, "database/tenant/migrations");
const migrationCount = compileTsDir(migrationsDir, migrationsDir);

// Seeds + dependencies: compile directly into build/ with alias rewrite.
const seedsCoreSrc = join(srcRoot, "database/tenant/seeds/core");
const seedsDataSrc = join(srcRoot, "database/tenant/seeds/data");
const seedsCoreOut = join(buildRoot, "database/tenant/seeds/core");
const seedsDataOut = join(buildRoot, "database/tenant/seeds/data");
const seederLibSrc = join(srcRoot, "libs/migration-seed");
const seederLibOut = join(buildRoot, "libs/migration-seed");

const seederLibFiles = ["Seeder.ts", "TenantSeeder.ts"];
let seederLibCount = 0;
for (const name of seederLibFiles) {
  compileFile(join(seederLibSrc, name), join(seederLibOut, name.replace(/\.ts$/, ".js")));
  seederLibCount += 1;
}
const seedDataCount = compileTsDir(seedsDataSrc, seedsDataOut);
const seedCoreCount = compileTsDir(seedsCoreSrc, seedsCoreOut, {
  rewriteAliases: true,
});

console.log(
  `[compile-tenant-migrations] wrote ${migrationCount} migration .js files to ${migrationsDir}`,
);
console.log(
  `[compile-tenant-migrations] wrote ${seederLibCount} seeder lib .js files to ${seederLibOut}`,
);
console.log(
  `[compile-tenant-migrations] wrote ${seedDataCount} seed data .js files to ${seedsDataOut}`,
);
console.log(
  `[compile-tenant-migrations] wrote ${seedCoreCount} seed .js files to ${seedsCoreOut}`,
);
