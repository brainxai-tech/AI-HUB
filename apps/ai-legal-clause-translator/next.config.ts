import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  trailingSlash: Boolean(basePath),
  poweredByHeader: false,
};

export default nextConfig;
