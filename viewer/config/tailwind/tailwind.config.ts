import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        editor: {
          base: "hsl(var(--ctp-base))",
          mantle: "hsl(var(--ctp-mantle))",
          crust: "hsl(var(--ctp-crust))",
          surface0: "hsl(var(--ctp-surface0))",
          surface1: "hsl(var(--ctp-surface1))",
          surface2: "hsl(var(--ctp-surface2))",
          text: "hsl(var(--ctp-text))",
          subtext0: "hsl(var(--ctp-subtext0))",
          subtext1: "hsl(var(--ctp-subtext1))",
          blue: "hsl(var(--ctp-blue))",
          green: "hsl(var(--ctp-green))",
          yellow: "hsl(var(--ctp-yellow))",
          red: "hsl(var(--ctp-red))",
          mauve: "hsl(var(--ctp-mauve))",
          peach: "hsl(var(--ctp-peach))",
          teal: "hsl(var(--ctp-teal))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        panel: "0 18px 50px -24px rgba(0, 0, 0, 0.55)",
      },
    },
  },
  plugins: [],
} satisfies Config;
