/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Modern Minimal Fintech / SaaS Palette
        app: {
          bg: "#F8F9FA",
          card: "#FFFFFF",
          ink: "#0A0A0C",
          muted: "#64748B",
          subtle: "#94A3B8",
          border: "#E2E8F0",
          "border-light": "rgba(0, 0, 0, 0.05)",
          hover: "#F1F5F9",
        },
        electric: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          500: "#0066FF",
          600: "#0052CC",
          700: "#0043A8",
        },
        accentPink: {
          50: "#FFF1F2",
          100: "#FFE4E6",
          500: "#F43F5E",
          600: "#E11D48",
        },
        // Keep brand/surface mappings for existing dashboard components
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#0066FF",
          600: "#0052CC",
          700: "#0043A8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#0F172A",
        },
        surface: {
          50: "#F8F9FA",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#0A0A0C",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
        "4xl": "32px",
        "5xl": "40px",
      },
      boxShadow: {
        card: "0 20px 60px -15px rgba(0, 0, 0, 0.05), 0 0 1px rgba(0, 0, 0, 0.08)",
        floating: "0 24px 48px -12px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
        "pill-blue": "0 4px 14px rgba(0, 102, 255, 0.25)",
        "pill-blue-lg": "0 8px 24px rgba(0, 102, 255, 0.35)",
        glossy: "inset 0 1px 2px rgba(255, 255, 255, 0.8), 0 20px 40px -10px rgba(0, 102, 255, 0.15)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite 1s",
        "float-reverse": "floatReverse 7s ease-in-out infinite 0.5s",
        "pulse-subtle": "pulseSubtle 3s ease-in-out infinite",
        "glow-blue": "glowBlue 2.5s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(3deg)" },
        },
        floatReverse: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(10px) rotate(-3deg)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        glowBlue: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 102, 255, 0.2)" },
          "50%": { boxShadow: "0 0 35px rgba(0, 102, 255, 0.4)" },
        },
      },
    },
  },
  plugins: [],
};
