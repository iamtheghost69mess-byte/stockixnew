import { defineConfig } from "tsup";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  entry: ["../../infra/worker-service/src/worker.ts"],
  format: ["cjs"],
  outExtension: () => ({ js: ".js" }),
  outDir: "../../infra/worker-service/.runtime",
  target: "node20",
  bundle: true,
  sourcemap: true,
  clean: true,
  // ORIGINAL: external: ["nodemailer", "prom-client"],
  external: [
    "nodemailer",
    "prom-client",
    // @opentelemetry/* (incl. all instrumentation-* packages pulled in by
    // auto-instrumentations-node) + require-in-the-middle/import-in-the-middle
    // do Node module-loader hooking via dynamic require() that esbuild's
    // bundled ESM output can't support. Kept external; only reached via
    // dynamic import() in tracing.ts when ENABLE_TRACING is set.
    /^@opentelemetry\//,
    "require-in-the-middle",
    "import-in-the-middle",
  ],
  // Bundle jose (not hoisted to repo root). nodemailer + prom-client stay external -- listed in root package.json for worker runtime.
  noExternal: [/^@repo\//, "jose", /^@repo\/platform-worker-shared/],
  esbuildOptions(options) {
    options.alias = {
      "@repo/config/public": path.resolve(
        dirname,
        "../../packages/config/src/public.ts",
      ),
      "@repo/config": path.resolve(dirname, "../../packages/config/src/index.ts"),
      "@repo/db": path.resolve(dirname, "../../packages/db/src/index.ts"),
      "@repo/db/schema": path.resolve(dirname, "../../packages/db/src/schema.ts"),
      "@repo/shared/finance-api": path.resolve(
        dirname,
        "../../packages/shared/src/finance-api.ts",
      ),
      "@repo/platform-worker-shared": path.resolve(
        dirname,
        "../../packages/platform-worker-shared/src/index.ts",
      ),
    };
  },
});
