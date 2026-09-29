/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/web/index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0c0f",
          900: "#0f1114",
          850: "#14161a",
          800: "#191c21",
          750: "#1f232a",
          700: "#262b33",
          600: "#333943",
          500: "#454c58",
          400: "#697180"
        },
        brass: {
          300: "#e6c98a",
          400: "#d4af6a",
          500: "#c9a35f",
          600: "#a98748"
        },
        mist: {
          50: "#f4f5f7",
          100: "#e7e9ee",
          200: "#c6cbd5",
          300: "#9aa2b1",
          400: "#778090"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.5)",
        pop: "0 16px 48px -16px rgba(0,0,0,0.65)"
      }
    }
  },
  plugins: []
}
