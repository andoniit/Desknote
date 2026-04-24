import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, romantic-minimal palette
        cream: {
          DEFAULT: "#FDFAF6",
          50: "#FFFDFB",
          100: "#FDFAF6",
          200: "#F8F1E9",
        },
        blush: {
          DEFAULT: "#F5D5D0",
          50: "#FDF4F2",
          100: "#FBE8E4",
          200: "#F5D5D0",
          300: "#EDBEB7",
          400: "#E29E95",
        },
        rose: {
          DEFAULT: "#D98A8A",
          50: "#FBEFEF",
          100: "#F4D6D6",
          200: "#EAB3B3",
          300: "#D98A8A",
          400: "#C26767",
        },
        plum: {
          DEFAULT: "#6B4E57",
          50: "#F3EDEF",
          100: "#D9C8CE",
          200: "#B798A3",
          300: "#8B6A77",
          400: "#6B4E57",
          500: "#4E353D",
        },
        ash: {
          DEFAULT: "#E5DED6",
          50: "#F5F1ED",
          100: "#EDE7E0",
          200: "#E5DED6",
          300: "#C9BFB3",
          400: "#8C8179",
        },
      },
      /* Emoji fallbacks on serif: Fraunces has no color emoji; without these, U+1F300+ can render as “tofu”. */
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
        serif: [
          "var(--font-fraunces)",
          "ui-serif",
          "Georgia",
          "serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 2px 10px -2px rgba(107, 78, 87, 0.08), 0 4px 24px -6px rgba(107, 78, 87, 0.08)",
        card: "0 1px 2px rgba(107, 78, 87, 0.04), 0 8px 28px -12px rgba(107, 78, 87, 0.12)",
        glow: "0 0 0 6px rgba(217, 138, 138, 0.10)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "home-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 420ms ease-out both",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        "home-marquee": "home-marquee 55s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
