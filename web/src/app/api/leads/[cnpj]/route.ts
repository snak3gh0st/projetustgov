import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// Update a single project (by id) — status_contato + observacoes
export async function PATCH(
  request: NextRequest,
  { params }: { params: { cnpj: string } }
) {
  try {
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const projectId = body.id

    if (!projectId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (body.status_contato !== undefined) {
      updates.push(`status_contato = $${paramIndex++}`)
      values.push(body.status_contato)
    }
    if (body.observacoes !== undefined) {
      updates.push(`observacoes = $${paramIndex++}`)
      values.push(String(body.observacoes))
    }
    if (body.telefone !== undefined) {
      updates.push(`telefone = $${paramIndex++}`)
      values.push(body.telefone)
    }
    if (body.email !== undefined) {
      updates.push(`email = $${paramIndex++}`)
      values.push(body.email)
    }
    if (body.valor_venda !== undefined) {
      updates.push(`valor_venda = $${paramIndex++}`)
      values.push(body.valor_venda)
    }
    if (body.tipo_vendedor !== undefined) {
      updates.push(`tipo_vendedor = $${paramIndex++}`)
      values.push(body.tipo_vendedor)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    values.push(projectId)

    // Vendedor can only update their own projects
    let vendedorCondition = ''
    if (session.role === 'vendedor') {
      values.push(session.userId)
      vendedorCondition = `AND vendedor_id = $${paramIndex + 1}`
    }

    await query(`
      UPDATE vendedor_projetos
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} ${vendedorCondition}
    `, values)

    // Commission lock/unlock logic (COM-01: vendedor vinculado ao lead quando marca Fechado)
    if (body.status_contato === 'Fechado') {
      // Step 1: Ensure vendedor_id is set. If NULL, assign current user as vendedor.
      // This fulfills COM-01 requirement that vendedor is linked to lead when marking Fechado.
      await query(`
        UPDATE vendedor_projetos
        SET vendedor_id = $2, updated_at = NOW()
        WHERE id = $1 AND vendedor_id IS NULL
      `, [projectId, session.userId])

      // Step 2: Always recalculate and lock commission when setting Fechado
      // Formula: Comissao = valor_venda * vendedor_percentage + taxa_fixa
      //          SDR 1%, Closer 4%, + R$50 per fechamento
      // Example: 100k sale → SDR gets 1% = R$1,000 + R$50 = R$1,050
      await query(`
        WITH lead_info AS (
          SELECT id, tipo_vendedor, valor_venda
          FROM vendedor_projetos WHERE id = $1
        ),
        override_check AS (
          SELECT percentual_override, taxa_fixa_override
          FROM commission_overrides
          WHERE lead_id = $1 AND active = true
          ORDER BY created_at DESC LIMIT 1
        ),
        config_check AS (
          SELECT percentual_default, taxa_fixa
          FROM commission_config
          WHERE tipo_vendedor = (SELECT tipo_vendedor FROM lead_info)
            AND vendedor_id IS NULL AND active = true
          ORDER BY created_at DESC LIMIT 1
        )
        UPDATE vendedor_projetos
        SET comissao_percentual = COALESCE(
              (SELECT percentual_override FROM override_check),
              (SELECT percentual_default FROM config_check),
              CASE WHEN tipo_vendedor = 'SDR' THEN 1.00 ELSE 4.00 END
            ),
            comissao_valor = (
              COALESCE(valor_venda, 0) * (
                COALESCE(
                  (SELECT percentual_override FROM override_check),
                  (SELECT percentual_default FROM config_check),
                  CASE WHEN tipo_vendedor = 'SDR' THEN 1.00 ELSE 4.00 END
                ) / 100
              )
            ) + COALESCE(
              (SELECT taxa_fixa_override FROM override_check),
              (SELECT taxa_fixa FROM config_check),
              50.00
            ),
            comissao_locked = true,
            updated_at = NOW()
        WHERE id = $1
      `, [projectId])
    } else if (body.status_contato !== undefined && body.status_contato !== 'Fechado') {
      // Unlock commission if status changes away from Fechado
      await query(`
        UPDATE vendedor_projetos SET comissao_locked = false, comissao_valor = NULL, comissao_percentual = NULL WHERE id = $1 AND comissao_locked = true
      `, [projectId])
    } else if (body.tipo_vendedor !== undefined && !body.status_contato) {
      // If tipo_vendedor changed and lead is already Fechado, recalculate commission
      await query(`
        WITH lead_info AS (
          SELECT id, tipo_vendedor, valor_venda, status_contato
          FROM vendedor_projetos WHERE id = $1
        ),
        config_check AS (
          SELECT percentual_default, taxa_fixa
          FROM commission_config
          WHERE tipo_vendedor = (SELECT tipo_vendedor FROM lead_info)
            AND vendedor_id IS NULL AND active = true
          ORDER BY created_at DESC LIMIT 1
        )
        UPDATE vendedor_projetos
        SET comissao_percentual = COALESCE(
              (SELECT percentual_default FROM config_check),
              CASE WHEN tipo_vendedor = 'SDR' THEN 1.00 ELSE 4.00 END
            ),
            comissao_valor = (
              COALESCE(valor_venda, 0) * (
                COALESCE(
                  (SELECT percentual_default FROM config_check),
                  CASE WHEN tipo_vendedor = 'SDR' THEN 1.00 ELSE 4.00 END
                ) / 100
              )
            ) + COALESCE((SELECT taxa_fixa FROM config_check), 50.00),
            updated_at = NOW()
        WHERE id = $1 AND status_contato = 'Fechado'
      `, [projectId])
    }

    // Return updated commission data so frontend can refresh
    const updated = await query(
      `SELECT comissao_percentual, comissao_valor, tipo_vendedor, valor_venda, status_contato FROM vendedor_projetos WHERE id = $1`,
      [projectId]
    )

    return NextResponse.json({ success: true, ...(updated[0] || {}) })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
