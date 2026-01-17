import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // serverActions is true by default in Next.js 14/15
  },
};


export default nextConfig;
