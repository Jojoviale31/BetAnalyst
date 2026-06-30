/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: { 0: "#09090b", 1: "#111113", 2: "#18181b", 3: "#222225", 4: "#2c2c30" },
        brand: { DEFAULT: "#6366f1", light: "#818cf8", dark: "#4f46e5" },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
