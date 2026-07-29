import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/aesthetic/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5179,
    proxy: {
      "/api": "http://127.0.0.1:8789"
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 5179
  }
});
