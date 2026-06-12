import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        academy: {
          ink: '#0f172a',
          sand: '#f8fafc',
          blue: '#0f4c81',
          gold: '#b88917',
        },
      },
    },
  },
  plugins: [],
}

export default config
