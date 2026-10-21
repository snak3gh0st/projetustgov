import type { Config } from 'tailwindcss'

// Uma única escala de neutros (levemente puxada para o azul da marca) para gray,
// slate e zinc: o app misturava as três. Valores por tema em globals.css (--n-*).
const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const neutral = Object.fromEntries(
  NEUTRAL_STEPS.map((step) => [step, `oklch(var(--n-${step}) / <alpha-value>)`])
)

const token = (name: string) => `oklch(var(--${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: neutral,
        slate: neutral,
        zinc: neutral,
        neutral,
        // Papéis semânticos (primitivos em components/ui)
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: {
          DEFAULT: token('ink'),
          2: token('ink-2'),
          3: token('ink-3'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
          ink: token('accent-ink'),
        },
        sigma: {
          navy: '#050B1F',
          'navy-light': '#0A1628',
          'navy-card': '#111B2E',
          neon: '#0072F7',
          'neon-dim': '#0058C4',
          magenta: '#FD225C',
          purple: '#7A4BAC',
        },
        tier: {
          high: '#10B981',
          medium: '#0072F7',
          low: '#6B7280',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
      },
      zIndex: {
        sticky: '20',
        dropdown: '30',
        nav: '40',
        overlay: '50',
        modal: '60',
        toast: '70',
        tooltip: '80',
      },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '280ms',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 200ms cubic-bezier(0.25, 1, 0.5, 1) both',
        'rise-in': 'rise-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
