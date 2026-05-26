import "@repo/config";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dashboardDir, "..", "..");
const reactRoot = realpathSync(path.join(repoRoot, "node_modules", "react"));
const reactDomRoot = realpathSync(path.join(repoRoot, "node_modules", "react-dom"));

const reactAliases = {
  react: reactRoot,
  "react-dom": reactDomRoot,
  "react/jsx-runtime": path.join(reactRoot, "jsx-runtime.js"),
  "react/jsx-dev-runtime": path.join(reactRoot, "jsx-dev-runtime.js"),
  "react-dom/client": path.join(reactDomRoot, "client.js"),
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
    return config;
  },
};

export default nextConfig;
