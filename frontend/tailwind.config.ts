import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Claude-inspired palette: warm cream surfaces, near-black ink, coral accent.
        // Contrast targets (vs. cream #F5F1EA): WCAG AA normal-text 4.5:1.
        //   ink #1F1B17  ≈ 16.8:1
        //   ink-muted #5C5650 ≈ 6.8:1
        //   ink-subtle #6F685F ≈ 4.7:1 (was #8C857C ≈ 3.0:1, failed AA)
        //   coral #A94E2E ≈ 5.0:1; cream-on-coral ≈ 5.0:1 — both pass AA.
        ink: {
          DEFAULT: "#1F1B17",
          muted: "#5C5650",
          subtle: "#6F685F",
        },
        cream: {
          DEFAULT: "#F5F1EA",
          raised: "#FBF8F2",
          sunken: "#EDE7DC",
        },
        coral: {
          DEFAULT: "#A94E2E",
          hover: "#923F23",
          tint: "#F2DDD2",
        },
        line: "#E2DACB",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Source Serif Pro", "Georgia", "serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(31, 27, 23, 0.04), 0 1px 3px rgba(31, 27, 23, 0.06)",
      },
      letterSpacing: {
        tightest: "-0.025em",
      },
    },
  },
  plugins: [],
};

export default config;
