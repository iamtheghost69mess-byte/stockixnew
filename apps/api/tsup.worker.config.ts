import { defineConfig } from "tsup";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["../../infra/worker-service/src/worker.ts"],
  format: ["esm"],
  outDir: "../../infra/worker-service/.runtime",
  target: "node20",
  bundle: true,
  sourcemap: true,
  clean: true,
  // Bundle jose (not hoisted to repo root). nodemailer stays external — listed in root package.json for worker runtime.
  noExternal: [/^@repo\//, "jose"],
  esbuildOptions(options) {
    options.alias = {
      "@repo/config": path.resolve(dirname, "../../packages/config/src/index.ts"),
      "@repo/db": path.resolve(dirname, "../../packages/db/src/index.ts"),
      "@repo/db/schema": path.resolve(dirname, "../../packages/db/src/schema.ts"),
      "@repo/shared/finance-api": path.resolve(
        dirname,
        "../../packages/shared/src/finance-api.ts",
      ),
    };
  },
});
