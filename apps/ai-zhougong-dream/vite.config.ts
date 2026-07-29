import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/zhougong/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
