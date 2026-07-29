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
        ink: "#232522",
        paper: "#fbfaf6",
        chalk: "#f4efe5",
        cypress: "#1f6b5c",
        slate: "#43515a",
        coral: "#d94f45",
        gold: "#b8872b",
      },
      boxShadow: {
        panel: "0 18px 54px rgba(35, 37, 34, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
