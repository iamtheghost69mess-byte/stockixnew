import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../..");

/**
 * Deduplicate React across packages in the monorepo.
 *
 * Use raw `path.join` rather than `realpathSync` — resolving symlinks at
 * config-evaluation time causes Next.js to detect a false file-system change
 * and restart the dev server in an infinite loop on Windows/WSL2.
 *
 * Server bundle is intentionally excluded: aliasing React server-side breaks
 * the `react-server` export condition and causes null-dispatcher errors in
 * layout-router / RSC.
 */
const reactAliases = {
  react: path.join(repoRoot, "node_modules/react"),
  "react-dom": path.join(repoRoot, "node_modules/react-dom"),
} as const;

// ---------------------------------------------------------------------------
// Webpack dev-watch ignore patterns
// ---------------------------------------------------------------------------

const DEV_WATCH_IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/dist/**",
  "**/.swc/**",
  "**/infra/**",
  "**/services/**",
  "**/.claude/**",
  "**/packages/**/dist/**",
  "**/.next/cache/**",
  "**/logs/**",
  "**/sessions/**",
  "**/*.log",
  "**/tmp/**",
  "**/.turbo/**",
] as const;

// ---------------------------------------------------------------------------
// Next.js config
// ---------------------------------------------------------------------------

const nextConfig: NextConfig = {
  // ── Output ────────────────────────────────────────────────────────────────
  output: "standalone",
  outputFileTracingRoot: repoRoot,

  // ── Rewrites ──────────────────────────────────────────────────────────────
  async rewrites() {
    const apiUrl = process.env.STOCKIX_API_URL || process.env.NEXT_PUBLIC_STOCKIX_API_URL || "http://127.0.0.1:4000";
    return [
      {
        source: "/api/health",
        destination: `${apiUrl}/health`,
      },
      {
        source: "/api/me",
        destination: `${apiUrl}/v1/auth/me`,
      },
      {
        source: "/api/security/mfa/:path*",
        destination: `${apiUrl}/v1/auth/mfa/:path*`,
      },
      {
        source: "/api/pms/:path*",
        destination: `${apiUrl}/v1/pms/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiUrl}/v1/:path*`,
      },
    ];
  },

  // ── React ─────────────────────────────────────────────────────────────────
  reactStrictMode: true,

  // ── Dev origins ───────────────────────────────────────────────────────────
  // Dashboard binds 0.0.0.0; permit HMR connections from both aliases.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // ── Transpilation ─────────────────────────────────────────────────────────
  transpilePackages: [
    "@base-ui/react",
    "react-hook-form",
    "@hookform/resolvers",
    "@repo/ui-core",
    "@repo/ui-shared",
    "@repo/theme",
  ],

  // ── Experimental ──────────────────────────────────────────────────────────
  experimental: {
    optimizePackageImports: [
      "@base-ui/react",
      "lucide-react",
      "react-hook-form",
    ],
    // Worker threads have high IPC overhead on Windows — only enable in production.
    webpackBuildWorker: process.env.NODE_ENV === "production",
  },

  // ── Turbopack (opt-in via STOCKIX_NEXT_TURBOPACK=1) ───────────────────────
  turbopack: {
    resolveAlias: reactAliases,
  },

  // ── Webpack ───────────────────────────────────────────────────────────────
  webpack(config, { dev, isServer }) {
    // React deduplication — client bundle only (see note above).
    if (!isServer) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...config.resolve.alias,
        ...reactAliases,
      };
    }
    
    // Support NodeNext module resolution with .js extensions from workspace packages
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };

    // Dev-mode watch optimisation.
    // A higher aggregateTimeout (2 s) prevents rapid config-change false
    // positives from cascading into repeated server restarts.
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: DEV_WATCH_IGNORED,
        aggregateTimeout: 2_000,
        poll: false,
      };
    }

    return config;
  },
};

// ---------------------------------------------------------------------------
// Sentry wrapper
// ---------------------------------------------------------------------------

const sentryOptions = {
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
};

export default process.env.NODE_ENV === "production"
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;