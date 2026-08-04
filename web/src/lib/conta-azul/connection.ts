import 'server-only'
import { query } from '@/lib/db'
import { CONTA_AZUL_API_BASE, getContaAzulConfig } from './config'
import { decryptSecret, encryptSecret } from './crypto'
import { exchangeAuthorizationCode, refreshAccessToken, type ContaAzulTokenResponse } from './oauth'
import { ensureContaAzulSchema } from './schema'

export type ContaAzulConnection = {
  id: string
  tenant_key: string
  company_name: string | null
  account_email: string | null
  status: string
  token_expires_at: string | null
  last_connected_at: string | null
  last_polled_at: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  metadata: Record<string, unknown>
}

export async function getConnectionStatus() {
  await ensureContaAzulSchema()
  const { tenantKey, clientId, redirectUri } = getContaAzulConfig()
  const rows = await query<ContaAzulConnection>(
    `SELECT id, tenant_key, company_name, account_email, status,
            token_expires_at::text, last_connected_at::text, last_polled_at::text,
            access_token_encrypted, refresh_token_encrypted, metadata
     FROM conta_azul_connections
     WHERE tenant_key = $1
     LIMIT 1`,
    [tenantKey]
  )
  const conn = rows[0]
  return {
    configured: true,
    tenantKey,
    clientId,
    redirectUri,
    connection: conn
      ? {
          id: conn.id,
          status: conn.status,
          companyName: conn.company_name,
          accountEmail: conn.account_email,
          tokenExpiresAt: conn.token_expires_at,
          lastConnectedAt: conn.last_connected_at,
          lastPolledAt: conn.last_polled_at,
          hasTokens: Boolean(conn.access_token_encrypted),
        }
      : null,
  }
}

async function fetchConnectedCompany(accessToken: string) {
  const res = await fetch(`${CONTA_AZUL_API_BASE}/v1/pessoas/conta-conectada`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json().catch(() => null)) as Record<string, unknown> | null
}

function expiresAtFromTokens(tokens: ContaAzulTokenResponse) {
  const seconds = tokens.expires_in ?? 3600
  return new Date(Date.now() + seconds * 1000)
}

export async function saveTokensFromCode(opts: {
  code: string
  userId: string
}) {
  await ensureContaAzulSchema()
  const { tenantKey, clientId } = getContaAzulConfig()
  const tokens = await exchangeAuthorizationCode(opts.code)
  const company = await fetchConnectedCompany(tokens.access_token)

  const companyName =
    (company?.nome as string) ||
    (company?.razao_social as string) ||
    (company?.name as string) ||
    null
  const accountEmail = (company?.email as string) || null

  const accessEnc = encryptSecret(tokens.access_token)
  const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null
  const expiresAt = expiresAtFromTokens(tokens)

  const rows = await query<{ id: string }>(
    `INSERT INTO conta_azul_connections (
       tenant_key, company_name, account_email, status, client_id_ref,
       access_token_encrypted, refresh_token_encrypted, token_expires_at,
       last_connected_at, metadata, created_by, updated_by, updated_at
     ) VALUES (
       $1, $2, $3, 'active', $4,
       $5, $6, $7,
       NOW(), $8::jsonb, $9::uuid, $9::uuid, NOW()
     )
     ON CONFLICT (tenant_key) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       account_email = EXCLUDED.account_email,
       status = 'active',
       client_id_ref = EXCLUDED.client_id_ref,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, conta_azul_connections.refresh_token_encrypted),
       token_expires_at = EXCLUDED.token_expires_at,
       last_connected_at = NOW(),
       metadata = EXCLUDED.metadata,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id`,
    [
      tenantKey,
      companyName,
      accountEmail,
      clientId,
      accessEnc,
      refreshEnc,
      expiresAt.toISOString(),
      JSON.stringify({ company: company ?? {} }),
      opts.userId,
    ]
  )

  return {
    id: rows[0]?.id,
    companyName,
    accountEmail,
    expiresAt: expiresAt.toISOString(),
  }
}

export async function disconnectConnection(userId: string) {
  await ensureContaAzulSchema()
  const { tenantKey } = getContaAzulConfig()
  await query(
    `UPDATE conta_azul_connections
     SET status = 'revoked',
         access_token_encrypted = NULL,
         refresh_token_encrypted = NULL,
         token_expires_at = NULL,
         updated_by = $2::uuid,
         updated_at = NOW()
     WHERE tenant_key = $1`,
    [tenantKey, userId]
  )
}

/** Returns a valid access token, refreshing when needed. */
export async function getValidAccessToken(): Promise<string> {
  await ensureContaAzulSchema()
  const { tenantKey } = getContaAzulConfig()
  const rows = await query<ContaAzulConnection>(
    `SELECT * FROM conta_azul_connections WHERE tenant_key = $1 LIMIT 1`,
    [tenantKey]
  )
  const conn = rows[0]
  if (!conn?.access_token_encrypted || conn.status !== 'active') {
    throw new Error('Conta Azul is not connected')
  }

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  const stillValid = expiresAt - Date.now() > 60_000
  if (stillValid) {
    return decryptSecret(conn.access_token_encrypted)
  }

  if (!conn.refresh_token_encrypted) {
    await query(
      `UPDATE conta_azul_connections SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [conn.id]
    )
    throw new Error('Conta Azul token expired; reconnect required')
  }

  const refreshToken = decryptSecret(conn.refresh_token_encrypted)
  const tokens = await refreshAccessToken(refreshToken)
  const accessEnc = encryptSecret(tokens.access_token)
  const refreshEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : conn.refresh_token_encrypted
  const expiresAtNew = expiresAtFromTokens(tokens)

  await query(
    `UPDATE conta_azul_connections
     SET access_token_encrypted = $2,
         refresh_token_encrypted = $3,
         token_expires_at = $4,
         status = 'active',
         updated_at = NOW()
     WHERE id = $1`,
    [conn.id, accessEnc, refreshEnc, expiresAtNew.toISOString()]
  )

  return tokens.access_token
}

export async function testConnection() {
  const token = await getValidAccessToken()
  const company = await fetchConnectedCompany(token)
  if (!company) throw new Error('Failed to call Conta Azul API')

  const { tenantKey } = getContaAzulConfig()
  await query(
    `UPDATE conta_azul_connections
     SET last_polled_at = NOW(),
         company_name = COALESCE($2, company_name),
         account_email = COALESCE($3, account_email),
         metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{company}', $4::jsonb, true),
         updated_at = NOW()
     WHERE tenant_key = $1`,
    [
      tenantKey,
      (company.nome as string) || (company.razao_social as string) || null,
      (company.email as string) || null,
      JSON.stringify(company),
    ]
  )

  return company
}
