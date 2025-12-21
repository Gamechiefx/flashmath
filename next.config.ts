import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // serverActions is true by default in Next.js 14/15
  },
  // Pure JavaScript version doesn't need external packages 
};


export default nextConfig;
