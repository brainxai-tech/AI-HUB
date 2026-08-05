import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === "build" ? "/mbti/" : "/"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5177,
  },
  preview: {
    host: "127.0.0.1",
    port: 4177,
  },
}));
