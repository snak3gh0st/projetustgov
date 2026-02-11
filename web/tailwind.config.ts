import type { Config } from 'tailwindcss'

const config: Config = {
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
          neon: '#00D4FF',
          'neon-dim': '#00A3CC',
        },
        tier: {
          high: '#10B981',
          medium: '#00D4FF',
          low: '#6B7280',
        },
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
