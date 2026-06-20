import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        muted: "#6B7280",
        subtle: "#94A3B8",
        mist: "#F8FAFC",
        card: "#FFFFFF",
        line: "#E5E7EB",
        mutedLine: "#F1F5F9",
        brand: "#2563EB"
      }
    }
  },
  plugins: []
};

export default config;
