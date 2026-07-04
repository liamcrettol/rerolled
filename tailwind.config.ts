import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        bungie: {
          blue: "#00aeef",
          dark: "#0d1117",
          surface: "#161b22",
          border: "#30363d",
        },
      },
      keyframes: {
        "bounce-in": {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "60%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pick-pop": {
          "0%": { transform: "scale(0.7) rotate(-6deg)", opacity: "0.3" },
          "55%": { transform: "scale(1.18) rotate(3deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "slot-land": {
          "0%":   { boxShadow: "0 0 0 0 rgba(0,174,239,0)" },
          "30%":  { boxShadow: "0 0 0 4px rgba(0,174,239,0.55)" },
          "100%": { boxShadow: "0 0 0 0 rgba(0,174,239,0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "glow-drift": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.5" },
          "50%":      { transform: "translate(3%, -4%) scale(1.08)", opacity: "0.8" },
        },
        "rise-in": {
          "0%":   { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "weapon-land": {
          "0%":   { transform: "scale(0.92)", boxShadow: "0 0 0 0 var(--land-glow, rgba(0,174,239,0))" },
          "45%":  { transform: "scale(1.1)",  boxShadow: "0 0 20px 4px var(--land-glow, rgba(0,174,239,0.65))" },
          "100%": { transform: "scale(1)",    boxShadow: "0 0 0 0 var(--land-glow, rgba(0,174,239,0))" },
        },
      },
      animation: {
        "bounce-in": "bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "pick-pop":  "pick-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "slot-land": "slot-land 0.6s ease-out forwards",
        "fade-in":   "fade-in 0.15s ease-out forwards",
        "glow-drift": "glow-drift 9s ease-in-out infinite",
        "rise-in":   "rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "weapon-land": "weapon-land 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
