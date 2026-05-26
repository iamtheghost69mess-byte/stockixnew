import "@repo/config";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dashboardDir, "..", "..");
const reactRoot = realpathSync(path.join(repoRoot, "node_modules", "react"));
const reactDomRoot = realpathSync(path.join(repoRoot, "node_modules", "react-dom"));

/** Dedupe React only — do not alias jsx-runtime paths (breaks react-server exports in RSC). */
const reactAliases = {
  react: reactRoot,
  "react-dom": reactDomRoot,
} as const;

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: [
    "@repo/ui",
    "@base-ui/react",
    "react-hook-form",
    "@hookform/resolvers",
  ],
  experimental: {
    optimizePackageImports: ["@base-ui/react", "lucide-react", "react-hook-form"],
  },
  turbopack: {
    resolveAlias: reactAliases,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      ...reactAliases,
    };
    config.resolve.dedupe = [...(config.resolve.dedupe ?? []), "react", "react-dom"];
    return config;
  },
};

export default nextConfig;
