/** @type {import('tailwindcss').Config} */
//
// VÉRIA design tokens — "Persian-inspired editorial minimalism × luxury enterprise".
// Semantic note: class names are kept from the original dark theme (ink/mist/brass)
// but re-pointed at the light material palette:
//   ink-*   → surfaces (ink-950 page parchment, ink-900 paper panel, 800+ hairlines)
//   mist-*  → text (mist-50 near-black charcoal primary, lighter = more muted)
//   brass-* → antique brass accent (never dominant)
// Status hues (red/amber/emerald/sky/indigo/teal/violet) are overridden to muted
// editorial equivalents: deep readable text tones (300/400) + pale material tints (950s).
export default {
  content: ["./src/web/index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — warm ivory / cream (exact spec tokens, no lavender cast)
        ink: {
          950: "#F5EEE2", // page background — warm ivory
          900: "#FBF6ED", // cards — cream white
          850: "#EFE4D2", // hover / recessed — secondary cream
          800: "#D8CBB7", // hairline borders
          750: "#CBBBA3",
          700: "#BBA98D",
          600: "#A29074",
          500: "#87765C",
          400: "#6F675D"
        },
        // Text — warm charcoal scale (mist-50 = primary #24211D)
        mist: {
          50: "#24211D",
          100: "#35302A",
          200: "#4A443C",
          300: "#5E574D",
          400: "#6F675D",
          500: "#8A8175"
        },
        // Restrained brass — accent only
        brass: {
          100: "#5C451B",
          200: "#6E5320",
          300: "#856528",
          400: "#A9824A",
          500: "#A9824A", // anchor (spec)
          600: "#8A6835",
          700: "#75572B",
          900: "#E7D9BC",
          950: "#F1E9D6"
        },
        // Deep plum / Persian wine — secondary accent
        plum: {
          300: "#642B38", // very restrained deep wine (spec)
          500: "#542433",
          700: "#471E2B",
          900: "#EAD4DC",
          950: "#F2E4EA"
        },
        // Muted lapis / deep blue — tertiary, used sparingly
        lapis: {
          300: "#33567f",
          500: "#2a486c",
          700: "#233c5a",
          900: "#d9e3ee",
          950: "#e8eff7"
        },
        // Muted editorial status palette (readable deep tones + pale tints)
        red: {
          300: "#A74732", // deep muted terracotta — revenue risk (spec)
          400: "#9A4130",
          800: "#9A4130",
          900: "#87382A",
          950: "#F3E3DC"
        },
        amber: {
          200: "#8a6116",
          300: "#96691c",
          700: "#8a6116",
          800: "#7a5513",
          900: "#6c4b11",
          950: "#f0e9d4"
        },
        emerald: {
          300: "#2F7058", // deep muted green — recovery positive (spec)
          400: "#2F7058",
          800: "#2A6350",
          900: "#255746",
          950: "#E0EAE0"
        },
        sky: {
          300: "#33607e",
          800: "#2d5670",
          900: "#274c63",
          950: "#e0eaf1"
        },
        indigo: {
          300: "#4a548c",
          800: "#414a7c",
          950: "#e5e7f3"
        },
        teal: {
          300: "#22635a",
          800: "#1e574f",
          900: "#1a4c45",
          950: "#ddece9"
        },
        violet: {
          300: "#5a4885",
          800: "#503f75",
          900: "#463766",
          950: "#e9e5f4"
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
        ],
        display: [
          "Fraunces",
          "Iowan Old Style",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif"
        ]
      },
      boxShadow: {
        card: "0 1px 2px rgba(62, 50, 28, 0.05), 0 0 0 1px rgba(62, 50, 28, 0.02)",
        pop: "0 24px 64px -24px rgba(46, 36, 16, 0.28), 0 2px 8px rgba(46, 36, 16, 0.06)"
      }
    }
  },
  plugins: []
}
