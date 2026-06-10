#!/usr/bin/env node
/**
 * Atomic phase safety — ensures no partial legacy/Nest hybrid state before deploy.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const FINANCE = path.join(root, "services/stockix-finance/packages/server");

const checks = [
  {
    label: "Nest entry only",
    run: () => {
      const main = path.join(FINANCE, "src/main.ts");
      if (!existsSync(main)) return "src/main.ts missing";
      return null;
    },
  },
  {
    label: "No legacy Express server",
    run: () =>
      existsSync(path.join(FINANCE, "src/server.ts"))
        ? "src/server.ts still present"
        : null,
  },
  {
    label: "No legacy api tree",
    run: () =>
      existsSync(path.join(FINANCE, "src/api"))
        ? "src/api/ still present"
        : null,
  },
  {
    label: "No legacy services tree",
    run: () =>
      existsSync(path.join(FINANCE, "src/services"))
        ? "src/services/ still present"
        : null,
  },
  {
    label: "package.json main → build/index.js",
    run: async () => {
      const pkg = JSON.parse(
        await readFile(path.join(FINANCE, "package.json"), "utf8"),
      );
      return pkg.main === "build/index.js"
        ? null
        : `main is ${pkg.main ?? "unset"}`;
    },
  },
  {
    label: "Dockerfile runtime target exists",
    run: async () => {
      const dockerfile = await readFile(
        path.join(FINANCE, "Dockerfile"),
        "utf8",
      );
      if (!dockerfile.includes("AS runtime")) return "no runtime stage";
      if (!dockerfile.includes("build/index.js")) return "CMD must use build/index.js";
      return null;
    },
  },
  {
    label: "Constants compatibility layer present",
    run: () =>
      existsSync(path.join(FINANCE, "src/constants/Accounts/constants.ts"))
        ? null
        : "src/constants/ missing (models depend on migrated constants)",
  },
];

const failures = [];

for (const check of checks) {
  const err = await check.run();
  if (err) failures.push({ label: check.label, err });
}

console.log("FINANCE PHASE SAFETY");
console.log("--------------------");
for (const check of checks) {
  const failed = failures.find((f) => f.label === check.label);
  console.log(`${failed ? "FAIL" : "PASS"} — ${check.label}`);
}

if (failures.length) {
  console.log("\nBlocked partial migration state:");
  for (const f of failures) console.log(`- ${f.label}: ${f.err}`);
  process.exit(1);
}

console.log("\nAll phase-safety checks passed.");
process.exit(0);
