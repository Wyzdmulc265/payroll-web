import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for Prisma
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;