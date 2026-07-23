import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
