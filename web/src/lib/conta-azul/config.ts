import 'server-only'

export const CONTA_AZUL_AUTH_BASE = 'https://auth.contaazul.com'
export const CONTA_AZUL_API_BASE = 'https://api-v2.contaazul.com'
export const CONTA_AZUL_SCOPE = 'openid profile aws.cognito.signin.user.admin'

export function getContaAzulConfig() {
  const clientId = process.env.CONTA_AZUL_CLIENT_ID?.trim()
  const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET?.trim()
  const redirectUri =
    process.env.CONTA_AZUL_REDIRECT_URI?.trim() ||
    'https://projete.sigmaintel.io/api/integrations/conta-azul/callback'
  const tenantKey = process.env.CONTA_AZUL_TENANT_KEY?.trim() || 'projetus'
  const encryptionKey = process.env.CONTA_AZUL_TOKEN_ENCRYPTION_KEY?.trim()

  if (!clientId || !clientSecret) {
    throw new Error('CONTA_AZUL_CLIENT_ID and CONTA_AZUL_CLIENT_SECRET are required')
  }
  if (!encryptionKey) {
    throw new Error('CONTA_AZUL_TOKEN_ENCRYPTION_KEY is required')
  }

  return { clientId, clientSecret, redirectUri, tenantKey, encryptionKey }
}

export function getContaAzulBasicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}
