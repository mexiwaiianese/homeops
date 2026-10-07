import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async headers() {
    const cache = [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }];
    return [
      { source: "/brand/:path*", headers: cache },
      { source: "/product/:path*", headers: cache },
      { source: "/about/:path*", headers: cache },
    ];
  },
};

export default nextConfig;
