import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  trailingSlash: Boolean(basePath),
  ...(basePath ? { basePath } : {}),
  experimental: {
    // Avoid Windows child-process creation failures while retaining Next's type-check worker.
    workerThreads: true,
  },
};

export default nextConfig;
