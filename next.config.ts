import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // serverActions is true by default in Next.js 14/15
  },
};


export default nextConfig;
