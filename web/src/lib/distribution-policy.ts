import 'server-only'

/**
 * Manual distribution is the safe default.
 * Set ENABLE_AUTO_DISTRIBUTION=true only if the round-robin paths should run again.
 */
export const AUTO_DISTRIBUTION_ENABLED = process.env.ENABLE_AUTO_DISTRIBUTION === 'true'
