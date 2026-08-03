/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── 2026 "quiet room" semantic palette ──────────────────────────────
        // Surfaces & text. These reference CSS custom properties (see
        // src/index.css) so a single `.dark` toggle (or OS preference) flips
        // the whole app without per-utility dark: variants.
        // NOTE: the `rgb(var(--x) / <alpha-value>)` form is required, not
        // cosmetic. The CSS vars hold space-separated RGB channels precisely so
        // that alpha modifiers (`bg-ink/5`, `bg-accent/10`, `text-slate/60`,
        // `border-accent/20`) compile. With a bare `var(--x)` holding a hex
        // string, Tailwind cannot compute the alpha and silently emits NO rule
        // for the modified class. See the token block in src/index.css.
        paper: 'rgb(var(--color-paper) / <alpha-value>)',   // page / card surface
        ink: 'rgb(var(--color-ink) / <alpha-value>)',       // primary text
        slate: 'rgb(var(--color-slate) / <alpha-value>)',   // metadata / secondary text
        hairline: 'var(--color-hairline)', // already translucent; no modifier

        // The ONE brand accent — deep ink-teal. Primary actions, focus rings,
        // the active timer ring, and the results arc dial.
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },

        // Recording state ONLY — warm vermillion.
        record: 'rgb(var(--color-record) / <alpha-value>)',

        // Status tokens. Variable-backed so the `.dark` block can lighten them
        // to clear 4.5:1 on dark paper — the light hex values are ~2.6-3.6:1
        // there, which is unreadable for `text-caution` / `text-danger`.
        success: 'rgb(var(--color-success) / <alpha-value>)',
        caution: 'rgb(var(--color-caution) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',

        // Straggler alias: any surviving `primary-*` class resolves to teal
        // during migration so a half-migrated screen never renders an
        // undefined color. Prefer `accent` in new code.
        primary: {
          50: '#E6F2EF',
          100: '#CCE5DF',
          200: '#99CCBF',
          300: '#66B29F',
          400: '#33997F',
          500: 'rgb(var(--color-accent) / <alpha-value>)',
          600: 'rgb(var(--color-accent) / <alpha-value>)',
          700: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          800: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          900: 'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['Fira Code', 'monospace'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
      boxShadow: {
        // ONE elevation token, reserved for overlays/modals only. Cards use
        // hairline borders, not drop-shadows.
        overlay: 'var(--elevation-overlay)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
