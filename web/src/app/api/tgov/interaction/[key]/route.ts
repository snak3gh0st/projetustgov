import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov, canWriteTgov } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const TGOV_INTERACTION_STATUSES = [
  'Sem Contato',
  'Em Contato',
  'Proposta Enviada',
  'Em Negociação',
  'Fechado',
  'Sem Interesse',
] as const

type TGovInteractionStatus = (typeof TGOV_INTERACTION_STATUSES)[number]

export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const itemKey = decodeURIComponent(params.key)
    const tab = request.nextUrl.searchParams.get('tab') ?? ''

    const rows = await query<{
      status: string | null
      obs: string | null
      updated_at: string | null
      updated_by: string | null
      vencimento: string | null
    }>(
      `SELECT status, obs, updated_at::text, updated_by, vencimento::text
       FROM tgov_interactions
       WHERE item_key = $1 AND tab = $2
       LIMIT 1`,
      [itemKey, tab]
    )

    if (rows.length === 0) {
      return NextResponse.json({ status: null, obs: null, updatedAt: null, updatedBy: null, vencimento: null }, { status: 200 })
    }

    const r = rows[0]
    return NextResponse.json({
      status: r.status,
      obs: r.obs,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
      vencimento: r.vencimento ?? null,
    })
  } catch (error) {
    console.error('[api/tgov/interaction GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch interaction' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const session = await getApiSession()
    if (!session || !canWriteTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const itemKey = decodeURIComponent(params.key)
    const body = await request.json() as { status?: string; obs?: string; tab: string; vencimento?: string | null }

    if (!body.tab) {
      return NextResponse.json({ error: 'tab is required' }, { status: 400 })
    }

    // Validate vencimento if provided
    if (body.vencimento !== undefined && body.vencimento !== null && body.vencimento !== '') {
      const d = new Date(body.vencimento)
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid vencimento date' }, { status: 400 })
      }
    }

    const updatedBy = session.email ?? session.userId
    const vencimento = body.vencimento || null

    const rows = await query<{
      status: string | null
      obs: string | null
      updated_at: string | null
      updated_by: string | null
      vencimento: string | null
    }>(
      `INSERT INTO tgov_interactions (item_key, tab, status, obs, updated_at, updated_by, vencimento)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6::date)
       ON CONFLICT (item_key, tab) DO UPDATE SET
         status = EXCLUDED.status,
         obs = EXCLUDED.obs,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by,
         vencimento = EXCLUDED.vencimento
       RETURNING status, obs, updated_at::text, updated_by, vencimento::text`,
      [itemKey, body.tab, body.status ?? null, body.obs ?? null, updatedBy, vencimento]
    )

    const r = rows[0]
    return NextResponse.json({
      status: r.status,
      obs: r.obs,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
      vencimento: r.vencimento ?? null,
    })
  } catch (error) {
    console.error('[api/tgov/interaction PATCH] Error:', error)
    return NextResponse.json({ error: 'Failed to save interaction' }, { status: 500 })
  }
}
