import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  trailingSlash: Boolean(basePath),
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
