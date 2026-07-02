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
        // Semantic status colors. These map to the same CSS variables the app
        // already uses everywhere as arbitrary values / inline styles — promoting
        // them to tokens enables clean, consistent utilities (text-danger,
        // bg-success-bg, border-danger, …) going forward. Purely additive: none
        // of these names collide with Tailwind's defaults.
        success: 'var(--success)',
        'success-bg': 'var(--success-bg)',
        warning: 'var(--warning)',
        'warning-bg': 'var(--warning-bg)',
        danger: 'var(--danger)',
        'danger-bg': 'var(--danger-bg)',
        'info-bg': 'var(--info-bg)',
      },
      textColor: {
        strong: 'var(--text-strong)',
        body: 'var(--text-body)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        link: 'var(--text-link)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        script: ['var(--font-script)'],
        mono: ['var(--font-mono)'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // sm maps to the brand --radius-sm (10px). Safe to define: no default
        // `rounded-sm` usages exist in the app, so nothing changes behavior.
        sm: 'var(--radius-sm)',
        pill: 'var(--radius-pill)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        // Brand shadow scale. sm/md/lg replace verbose shadow-[var(--shadow-*)]
        // arbitrary values; safe because the app uses no default shadow-sm/md/lg.
        // `soft` is kept as a legacy alias for --shadow-md.
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
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
