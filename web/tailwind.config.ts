import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
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
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
    },
  },
  plugins: [],
}

export default config
