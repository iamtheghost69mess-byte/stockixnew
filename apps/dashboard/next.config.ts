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
  outputFileTracingRoot: repoRoot,
  reactStrictMode: true,
  transpilePackages: [
    "@base-ui/react",
    "react-hook-form",
    "@hookform/resolvers",
  ],
  experimental: {
    optimizePackageImports: ["@base-ui/react", "lucide-react", "react-hook-form"],
  },
  // Turbopack: same client-only dedupe (opt-in via STOCKIX_NEXT_TURBOPACK=1).
  turbopack: {
    resolveAlias: reactAliases,
  },
  webpack: (config, { dev, isServer }) => {
    // Client bundle only — aliasing react on the server breaks react-server exports
    // and causes "Invalid hook call" / null dispatcher in layout-router.
    if (!isServer) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...config.resolve.alias,
        ...reactAliases,
      };
    }
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/infra/**",
          "**/services/**",
        ],
        aggregateTimeout: 300,
        poll: false,
      };
    }
    return config;
  },
};

export default nextConfig;
