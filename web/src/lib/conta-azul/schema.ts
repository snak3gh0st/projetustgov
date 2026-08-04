import 'server-only'
import { query } from '@/lib/db'

let ensured = false

/** Idempotent bootstrap of Conta Azul connection tables. */
export async function ensureContaAzulSchema() {
  if (ensured) return

  await query(`
    CREATE TABLE IF NOT EXISTS conta_azul_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_key VARCHAR(120) NOT NULL UNIQUE,
      company_name VARCHAR(255),
      account_email VARCHAR(255),
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      client_id_ref VARCHAR(255),
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      token_expires_at TIMESTAMPTZ,
      last_connected_at TIMESTAMPTZ,
      last_polled_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID,
      updated_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT conta_azul_connections_status_check
        CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'error'))
    )
  `)

  await query(`
    CREATE INDEX IF NOT EXISTS ix_conta_azul_connections_status
    ON conta_azul_connections(status)
  `)

  ensured = true
}
