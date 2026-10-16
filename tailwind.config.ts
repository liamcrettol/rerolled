import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontWeight: {bold: "600", extrabold: "600", black: "600"},
            // Archivo (variable width) + IBM Plex Mono, loaded via next/font in app/layout.tsx.
      fontFamily: {
        sans: ["var(--font-archivo)", "\"Segoe UI\"", "Arial", "sans-serif"],
        mono: ["var(--font-archivo)", "Arial", "sans-serif"],
      },
      colors: { white: "rgb(var(--ink) / <alpha-value>)", gray: {50:"rgb(var(--ink) / <alpha-value>)",100:"rgb(var(--ink) / <alpha-value>)",200:"rgb(var(--ink) / <alpha-value>)",300:"rgb(var(--ink) / <alpha-value>)",400:"rgb(var(--soft) / <alpha-value>)",500:"rgb(var(--soft) / <alpha-value>)",600:"rgb(var(--soft) / <alpha-value>)",700:"rgb(var(--soft) / <alpha-value>)",800:"rgb(var(--raised) / <alpha-value>)",900:"rgb(var(--raised) / <alpha-value>)",950:"rgb(var(--ground) / <alpha-value>)"},
        mida: { ground:"rgb(var(--ground) / <alpha-value>)",panel:"rgb(var(--ground) / <alpha-value>)",raised:"rgb(var(--raised) / <alpha-value>)",well:"rgb(var(--raised) / <alpha-value>)",text:"rgb(var(--ink) / <alpha-value>)",soft:"rgb(var(--soft) / <alpha-value>)",signal:"rgb(var(--signal) / <alpha-value>)"},
        bungie: {blue:"rgb(var(--ink) / <alpha-value>)",dark:"rgb(var(--ground) / <alpha-value>)",surface:"rgb(var(--raised) / <alpha-value>)",border:"rgb(var(--raised) / <alpha-value>)"},
      },
      keyframes: {
        "pick-pop": {
          "0%": { transform: "scale(0.85)", opacity: "0.4" },
          "60%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slot-land": {
          "0%":   { boxShadow: "0 0 0 0 rgba(242,241,237,0)" },
          "30%":  { boxShadow: "0 0 0 2px rgba(242,241,237,0.6)" },
          "100%": { boxShadow: "0 0 0 0 rgba(242,241,237,0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // Revolver cylinder: six discrete 60° clicks per revolution - move
        // fast, then hold, like thumbing a cylinder round by round.
        "cyl-spin": {
          "0%":             { transform: "rotate(0deg)" },
          "9%, 16.66%":     { transform: "rotate(60deg)" },
          "25.66%, 33.33%": { transform: "rotate(120deg)" },
          "42.33%, 50%":    { transform: "rotate(180deg)" },
          "59%, 66.66%":    { transform: "rotate(240deg)" },
          "75.66%, 83.33%": { transform: "rotate(300deg)" },
          "92.33%, 100%":   { transform: "rotate(360deg)" },
        },
        "weapon-land": {
          "0%":   { transform: "scale(0.96)" },
          "55%":  { transform: "scale(1.03)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "pick-pop":  "pick-pop 0.3s ease-out",
        "slot-land": "slot-land 0.5s ease-out forwards",
        "fade-in":   "fade-in 0.15s ease-out forwards",
        "cyl-spin":  "cyl-spin 1.9s cubic-bezier(0.34, 1.4, 0.64, 1) infinite",
        "weapon-land": "weapon-land 0.35s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
