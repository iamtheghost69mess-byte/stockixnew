import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node20",
  bundle: true,
  sourcemap: true,
  clean: true,
  noExternal: [/^@repo\//],
});
