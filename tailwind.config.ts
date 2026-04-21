import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#050A0F",
        surface: "#0D1821",
        "surface-2": "#11202C",
        border: "#1A2A3A",
        primary: "#00F5FF",
        secondary: "#7B2FFF",
        success: "#00FF88",
        danger: "#FF3366",
        warning: "#FFB800",
        "text-primary": "#E8F4FF",
        "text-muted": "#5A7A9A",
      },
      fontFamily: {
        heading: ["Syne", "system-ui", "sans-serif"],
        body: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "mesh-gradient":
          "radial-gradient(at 20% 10%, rgba(0,245,255,0.10) 0, transparent 50%), radial-gradient(at 80% 20%, rgba(123,47,255,0.10) 0, transparent 50%), radial-gradient(at 50% 90%, rgba(0,255,136,0.06) 0, transparent 50%)",
      },
      boxShadow: {
        neon: "0 0 12px rgba(0, 245, 255, 0.35), 0 0 36px rgba(0, 245, 255, 0.15)",
        "neon-violet":
          "0 0 12px rgba(123, 47, 255, 0.35), 0 0 36px rgba(123, 47, 255, 0.15)",
        "neon-green":
          "0 0 12px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.15)",
        "neon-red":
          "0 0 12px rgba(255, 51, 102, 0.35), 0 0 36px rgba(255, 51, 102, 0.15)",
      },
      keyframes: {
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 8px rgba(0,245,255,0.4)" },
          "50%": { boxShadow: "0 0 24px rgba(0,245,255,0.9)" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        floatMesh: {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(4%, -3%)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
        scanline: "scanline 7s linear infinite",
        floatMesh: "floatMesh 16s ease-in-out infinite",
        fadeUp: "fadeUp 0.4s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
