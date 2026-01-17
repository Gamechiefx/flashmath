import type { NextConfig } from "next";

// Read version from package.json
import packageJson from './package.json';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // serverActions is true by default in Next.js 14/15
  },
  env: {
    // Inject version at build time
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
};

export default nextConfig;
