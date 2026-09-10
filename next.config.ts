import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone mode is only needed for self-hosted Docker/Bun containers.
  // For Vercel deployments, Vercel natively builds and optimizes the .next output.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["https://*.space-z.ai"],
};

export default nextConfig;
