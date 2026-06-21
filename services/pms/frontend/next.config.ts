import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/ui-core", "@repo/ui-shared", "@repo/theme"],
};

export default nextConfig;
