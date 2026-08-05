import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: Boolean(basePath),
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
