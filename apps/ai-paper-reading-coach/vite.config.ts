import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE_PATH || (process.env.NODE_ENV === "production" ? "/paper/" : "/");

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5186,
    host: "127.0.0.1"
  },
  preview: {
    port: 5186,
    host: "127.0.0.1"
  }
});
