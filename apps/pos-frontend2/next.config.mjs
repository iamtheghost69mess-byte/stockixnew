import path from "node:path";

/** @type {import('next').NextConfig} */
const posApiOrigin = (process.env.NEXT_PUBLIC_POS_API_ORIGIN || "http://localhost:8010").replace(/\/$/, "");
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/ui-core", "@repo/ui-shared"],
  // Type errors in workspace packages are checked via tsc --noEmit separately.
  // Don't let them block the production image build.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    externalDir: true,
  },
  ...(process.env.NEXT_TURBOPACK_ROOT
    ? {
        turbopack: {
          root: path.resolve(process.env.NEXT_TURBOPACK_ROOT),
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${posApiOrigin}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
