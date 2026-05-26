import "@repo/config";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dashboardDir, "..", "..");
const reactRoot = realpathSync(path.join(repoRoot, "node_modules", "react"));
const reactDomRoot = realpathSync(path.join(repoRoot, "node_modules", "react-dom"));

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
    resolveAlias: {
      react: reactRoot,
      "react-dom": reactDomRoot,
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      react: reactRoot,
      "react-dom": reactDomRoot,
    };
    return config;
  },
};

export default nextConfig;
