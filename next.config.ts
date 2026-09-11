import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/logo.png", destination: "/Logo.png" },
    ];
  },
};

export default nextConfig;
