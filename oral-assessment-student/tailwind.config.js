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
        paper: 'var(--color-paper)',     // page / card surface
        ink: 'var(--color-ink)',         // primary text
        slate: 'var(--color-slate)',     // metadata / secondary text
        hairline: 'var(--color-hairline)', // 1px borders & dividers

        // The ONE brand accent — deep ink-teal. Primary actions, focus rings,
        // the active timer ring, and the results arc dial.
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
        },

        // Recording state ONLY — warm vermillion.
        record: 'var(--color-record)',

        // Status tokens.
        success: '#1B9E77',
        caution: '#B45309',
        danger: '#C0392B',

        // Straggler alias: any surviving `primary-*` class resolves to teal
        // during migration so a half-migrated screen never renders an
        // undefined color. Prefer `accent` in new code.
        primary: {
          50: '#E6F2EF',
          100: '#CCE5DF',
          200: '#99CCBF',
          300: '#66B29F',
          400: '#33997F',
          500: 'var(--color-accent)',
          600: 'var(--color-accent)',
          700: 'var(--color-accent-hover)',
          800: 'var(--color-accent-hover)',
          900: 'var(--color-accent-hover)',
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
