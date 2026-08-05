import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#242124",
        paper: "#fffdfb",
        xhs: "#e53e4d",
        plum: "#6f496e",
        mint: "#2f8b79",
      },
      boxShadow: {
        soft: "0 16px 50px rgba(33, 28, 32, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
