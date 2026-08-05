import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  trailingSlash: Boolean(basePath),
  ...(basePath ? { basePath } : {})
};

export default nextConfig;
