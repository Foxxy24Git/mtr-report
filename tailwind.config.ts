import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palet korporat Bank Nagari
        primary: {
          50: "#e6edf7",
          100: "#c0d0eb",
          200: "#96b0dd",
          300: "#6b90cf",
          400: "#4d78c5",
          500: "#2e60bb",
          600: "#2958af",
          700: "#224da0",
          800: "#1b4291",
          900: "#0f3070",
          DEFAULT: "#003580", // Biru korporat Bank Nagari
          dark: "#002560",
          light: "#0052CC",
        },
        accent: {
          DEFAULT: "#C8A84B", // Emas/gold aksen
          light: "#DFC06E",
          dark: "#A88930",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F4F6FA",
          subtle: "#EEF1F8",
        },
        nagari: {
          blue: "#003580",
          gold: "#C8A84B",
          navy: "#001E4E",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-md":
          "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
        "card-lg":
          "0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.05)",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        sm: "0.375rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in-left": "slideInLeft 0.25s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
