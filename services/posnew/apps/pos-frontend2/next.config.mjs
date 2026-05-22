/** @type {import('next').NextConfig} */
const posApiOrigin = (process.env.NEXT_PUBLIC_POS_API_ORIGIN || "http://localhost:8010").replace(/\/$/, "");

const nextConfig = {
  experimental: {
    externalDir: true,
  },
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
