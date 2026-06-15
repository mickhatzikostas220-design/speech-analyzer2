import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand tokens (per-user themeable via CSS variables)
        signature: 'var(--signature)',
        'signature-strong': 'var(--signature-strong)',
        'on-signature': 'var(--on-signature)',
        accent: 'var(--accent-2)',
        ink: {
          DEFAULT: 'var(--ink-900)',
          900: 'var(--ink-900)',
          800: 'var(--ink-800)',
          600: 'var(--ink-600)',
          500: 'var(--ink-500)',
          400: 'var(--ink-400)',
          300: 'var(--ink-300)',
          200: 'var(--ink-200)',
          100: 'var(--ink-100)',
          50: 'var(--ink-50)',
        },
        paper: 'var(--paper)',
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          sunk: 'var(--surface-sunk)',
          ink: 'var(--surface-ink)',
        },
        strong: 'var(--border-strong)',
      },
      textColor: {
        strong: 'var(--text-strong)',
        body: 'var(--text-body)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        script: ['var(--font-script)'],
        mono: ['var(--font-mono)'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        pill: 'var(--radius-pill)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        hard: 'var(--shadow-hard)',
        'hard-lg': 'var(--shadow-hard-lg)',
        soft: 'var(--shadow-md)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
