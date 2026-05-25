import "@repo/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const reactRoot = path.join(dashboardDir, "node_modules", "react");
const reactDomRoot = path.join(dashboardDir, "node_modules", "react-dom");

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
