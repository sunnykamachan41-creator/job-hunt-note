import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        mist: "#f7f9fc",
        line: "#dbe4f0",
        brand: "#3b6eea"
      }
    }
  },
  plugins: []
};

export default config;
