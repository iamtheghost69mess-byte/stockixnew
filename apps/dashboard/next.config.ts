import "@repo/config";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
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
  // Dashboard dev binds 0.0.0.0; allow HMR when opened via localhost or 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
          "**/.turbo/**",
          "**/dist/**",
          "**/.swc/**",
          "**/infra/**",
          "**/services/**",
          "**/.claude/**",
        ],
        aggregateTimeout: 500,
        poll: false,
      };
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
    automaticVercelMonitors: false,
  },
});
