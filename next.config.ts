import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: ["192.168.56.1", "localhost:3000"],
  },
  // Pure JavaScript version doesn't need external packages 
};


export default nextConfig;
