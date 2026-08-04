import 'server-only'
import {
  CONTA_AZUL_AUTH_BASE,
  CONTA_AZUL_SCOPE,
  getContaAzulBasicAuth,
  getContaAzulConfig,
} from './config'
import { createOAuthState } from './oauth-state'

export type ContaAzulTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export function buildAuthorizeUrl(userId: string): { url: string; state: string } {
  const { clientId, redirectUri } = getContaAzulConfig()
  const state = createOAuthState(userId)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: CONTA_AZUL_SCOPE,
  })
  return {
    url: `${CONTA_AZUL_AUTH_BASE}/login?${params.toString()}`,
    state,
  }
}

async function tokenRequest(body: URLSearchParams): Promise<ContaAzulTokenResponse> {
  const { clientId, clientSecret } = getContaAzulConfig()
  const res = await fetch(`${CONTA_AZUL_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${getContaAzulBasicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })

  const data = (await res.json().catch(() => ({}))) as ContaAzulTokenResponse & {
    error?: string
    error_description?: string
  }

  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || res.statusText
    throw new Error(`Conta Azul token exchange failed: ${detail}`)
  }
  return data
}

export async function exchangeAuthorizationCode(code: string): Promise<ContaAzulTokenResponse> {
  const { clientId, redirectUri } = getContaAzulConfig()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  })
  return tokenRequest(body)
}

export async function refreshAccessToken(refreshToken: string): Promise<ContaAzulTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return tokenRequest(body)
}
