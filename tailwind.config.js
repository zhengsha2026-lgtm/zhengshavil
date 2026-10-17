/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#f5f0ff",
          100: "#ece4ff",
          200: "#d9c8ff",
          300: "#bfa0ff",
          400: "#a174ff",
          500: "#8b4dfb",
          600: "#7a2fe8",
          700: "#6821c9",
          800: "#571da4",
          900: "#481c84",
        },
        surface: "#faf8f5",
      },
      boxShadow: {
        soft: "0 2px 12px rgba(0,0,0,0.06)",
        card: "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
