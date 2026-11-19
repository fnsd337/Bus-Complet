import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172923",
        forest: "#174b3e",
        mint: "#d9eee5",
        paper: "#f7f6f0",
        coral: "#ef755c",
        gold: "#edbd5c"
      },
      fontFamily: { sans: ["var(--font-cairo)", "Arial", "sans-serif"] },
      boxShadow: { soft: "0 18px 48px rgba(23, 41, 35, .08)" }
    }
  },
  plugins: []
};

export default config;
