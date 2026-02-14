import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// GET: Returns current active commission config for all tipo_vendedor types
export async function GET() {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gestor-only access
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    // Query active configs
    const configs = await query(`
      SELECT cc.id, cc.tipo_vendedor, cc.percentual_default, cc.taxa_fixa, cc.vendedor_id,
             u.nome as vendedor_nome, cc.active, cc.created_at, cc.updated_at
      FROM commission_config cc
      LEFT JOIN users u ON u.id = cc.vendedor_id
      WHERE cc.active = true
      ORDER BY cc.tipo_vendedor, cc.vendedor_id NULLS FIRST
    `)

    // Query recent overrides (last 20)
    const overrides = await query(`
      SELECT co.id, co.lead_id, co.percentual_override, co.taxa_fixa_override, co.motivo,
             co.approved_by, u.nome as approved_by_nome, co.active, co.created_at,
             vp.cnpj, vp.nome as lead_nome
      FROM commission_overrides co
      JOIN users u ON u.id = co.approved_by
      JOIN vendedor_projetos vp ON vp.id = co.lead_id
      WHERE co.active = true
      ORDER BY co.created_at DESC
      LIMIT 20
    `)

    return NextResponse.json({ configs, overrides })
  } catch (error) {
    console.error('GET commission-config error:', error)
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

// POST: Updates default commission config for a tipo_vendedor
export async function POST(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gestor-only access
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    const body = await request.json()
    const { tipo_vendedor, percentual_default, taxa_fixa } = body

    // Validation
    if (!tipo_vendedor || !['SDR', 'Closer'].includes(tipo_vendedor)) {
      return NextResponse.json({ error: 'tipo_vendedor must be "SDR" or "Closer"' }, { status: 400 })
    }
    if (typeof percentual_default !== 'number' || percentual_default < 0 || percentual_default > 100) {
      return NextResponse.json({ error: 'percentual_default must be 0-100' }, { status: 400 })
    }
    if (typeof taxa_fixa !== 'number' || taxa_fixa < 0) {
      return NextResponse.json({ error: 'taxa_fixa must be >= 0' }, { status: 400 })
    }

    // Step 1: Deactivate old configs for this tipo_vendedor (where vendedor_id IS NULL)
    await query(`
      UPDATE commission_config SET active = false, updated_at = NOW()
      WHERE tipo_vendedor = $1 AND vendedor_id IS NULL
    `, [tipo_vendedor])

    // Step 2: Insert new config
    await query(`
      INSERT INTO commission_config (tipo_vendedor, percentual_default, taxa_fixa, active, created_by)
      VALUES ($1, $2, $3, true, $4)
    `, [tipo_vendedor, percentual_default, taxa_fixa, session.userId])

    // Step 3: Recalculate commission for non-locked, non-overridden leads
    const recalculated = await query(`
      WITH updated AS (
        UPDATE vendedor_projetos
        SET comissao_percentual = $1,
            comissao_valor = (COALESCE(valor_emenda, 0) * ($1 / 100)) + $2,
            updated_at = NOW()
        WHERE tipo_vendedor = $3
          AND (comissao_locked IS NOT true)
          AND valor_emenda IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM commission_overrides co
            WHERE co.lead_id = vendedor_projetos.id AND co.active = true
          )
        RETURNING id
      )
      SELECT COUNT(*)::int as count FROM updated
    `)

    const recalculatedCount = recalculated[0]?.count || 0

    return NextResponse.json({ success: true, recalculated: recalculatedCount })
  } catch (error) {
    console.error('POST commission-config error:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}

// PUT: Create a per-lead commission override
export async function PUT(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gestor-only access
    if (session.role !== 'gestor') {
      return NextResponse.json({ error: 'Forbidden: gestor only' }, { status: 403 })
    }

    const body = await request.json()
    const { lead_id, percentual_override, taxa_fixa_override, motivo } = body

    // Validation
    if (!lead_id || typeof lead_id !== 'number') {
      return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })
    }
    if (typeof percentual_override !== 'number' || percentual_override < 0 || percentual_override > 100) {
      return NextResponse.json({ error: 'percentual_override must be 0-100' }, { status: 400 })
    }
    if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
      return NextResponse.json({ error: 'motivo is required' }, { status: 400 })
    }

    // Step 1: Deactivate any existing active override for this lead
    await query(`
      UPDATE commission_overrides SET active = false WHERE lead_id = $1
    `, [lead_id])

    // Step 2: Insert new override
    await query(`
      INSERT INTO commission_overrides (lead_id, percentual_override, taxa_fixa_override, motivo, approved_by, active)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [lead_id, percentual_override, taxa_fixa_override || null, motivo, session.userId])

    // Step 3: If lead is NOT locked, recalculate its commission using the override values
    await query(`
      UPDATE vendedor_projetos
      SET comissao_percentual = $1,
          comissao_valor = (COALESCE(valor_emenda, 0) * ($1 / 100)) + COALESCE($2, 0),
          updated_at = NOW()
      WHERE id = $3
        AND (comissao_locked IS NOT true)
        AND valor_emenda IS NOT NULL
    `, [percentual_override, taxa_fixa_override || 0, lead_id])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT commission-config error:', error)
    return NextResponse.json({ error: 'Failed to create override' }, { status: 500 })
  }
}
