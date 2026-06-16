/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#121417",
        muted: "#6b7280",
        line: "#e5e7eb",
        panel: "#f7f8fa",
        accent: "#0f766e",
      },
    },
  },
  plugins: [],
};
