const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}

module.exports = withSentryConfig(nextConfig, {
  org: 'sigma-y0',
  project: 'projetusgov-web',
  silent: true,
  sourcemaps: {
    disable: true,
  },
})
