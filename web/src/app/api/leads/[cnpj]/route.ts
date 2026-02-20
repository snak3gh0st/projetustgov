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

    // VALIDATION: valor_venda must be provided and positive to mark as Fechado
    // This check runs BEFORE the UPDATE to prevent invalid status changes
    if (body.status_contato === 'Fechado') {
      const bodyValorVenda = body.valor_venda != null ? Number(body.valor_venda) : null
      if (bodyValorVenda != null && bodyValorVenda > 0) {
        // valor_venda was sent in this request — proceed
      } else {
        // Check if there's already a valor_venda in the DB
        const existing = await query(
          `SELECT valor_venda FROM vendedor_projetos WHERE id = $1`,
          [projectId]
        )
        const existingValor = existing[0]?.valor_venda ? Number(existing[0].valor_venda) : 0
        if (!existingValor || existingValor <= 0) {
          return NextResponse.json(
            { error: 'valor_venda is required and must be > 0 to mark as Fechado' },
            { status: 400 }
          )
        }
      }
    }

    updates.push(`updated_at = NOW()`)
    values.push(projectId)

    // Vendedor/gestor_vendedor can update their own leads or leads where they are closer
    // Exception: setting Aguardando Closer is allowed on ANY lead (SDR hands off to closer)
    let vendedorCondition = ''
    if (session.role === 'vendedor' || session.role === 'gestor_vendedor') {
      if (body.status_contato !== 'Aguardando Closer') {
        values.push(session.userId)
        vendedorCondition = `AND (vendedor_id = $${paramIndex + 1} OR closer_id = $${paramIndex + 1})`
      }
    }

    await query(`
      UPDATE vendedor_projetos
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} ${vendedorCondition}
    `, values)

    // Commission lock/unlock logic (COM-01: vendedor vinculado ao lead quando marca Fechado)
    if (body.status_contato === 'Aguardando Closer') {
      console.log(`[PATCH] Aguardando Closer triggered for project ${projectId} by user ${session.userId} (${session.role})`)
      // SDR → Closer flow: SDR sends lead to Paulo as Closer
      // Set closer_id = Paulo, keep vendedor_id = SDR original
      // Note: active filter removed so inactive accounts are still found (avoids silent failures)
      const pauloRes = await query(
        "SELECT id, active FROM users WHERE email = 'paulo@projetus.org' LIMIT 1"
      )
      const pauloCloserId = pauloRes[0]?.id ?? null
      if (pauloCloserId) {
        if (!pauloRes[0]?.active) {
          console.warn('[PATCH] Paulo Gabriel account is inactive — still assigning as closer')
        }
        await query(`
          UPDATE vendedor_projetos
          SET closer_id = $2, updated_at = NOW()
          WHERE id = $1
        `, [projectId, pauloCloserId])
        console.log(`[PATCH] closer_id set to ${pauloCloserId} for project ${projectId}`)
      } else {
        console.error('[PATCH] Paulo Gabriel (paulo@projetus.org) NOT FOUND in users table — closer_id not set')
      }
    } else if (body.status_contato === 'Fechado') {
      // Step 1: Ensure vendedor_id is set. If NULL, assign current user as vendedor.
      await query(`
        UPDATE vendedor_projetos
        SET vendedor_id = $2, updated_at = NOW()
        WHERE id = $1 AND vendedor_id IS NULL
      `, [projectId, session.userId])

      // Check if this lead has a closer (split commission scenario)
      const leadCheck = await query(
        `SELECT closer_id, tipo_vendedor, valor_venda FROM vendedor_projetos WHERE id = $1`,
        [projectId]
      )
      const leadRow = leadCheck[0]
      const hasCloser = leadRow?.closer_id != null

      if (hasCloser) {
        // SPLIT COMMISSION: SDR gets 1%, Closer (Paulo) gets 3%
        // SDR commission (comissao_valor on vendedor_id)
        // Closer commission (closer_comissao_valor on closer_id)
        await query(`
          UPDATE vendedor_projetos
          SET comissao_percentual = 1.00,
              comissao_valor = COALESCE(valor_venda, 0) * 0.01,
              comissao_bonus = 50.00,
              closer_comissao_percentual = 3.00,
              closer_comissao_valor = COALESCE(valor_venda, 0) * 0.03,
              comissao_locked = true,
              updated_at = NOW()
          WHERE id = $1
        `, [projectId])
      } else {
        // Standard commission: no closer involved
        // Recalculate and lock commission when setting Fechado
        // SDR 1%, Closer 4%, Exclusivo 3%
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
                CASE
                  WHEN tipo_vendedor = 'SDR' THEN 1.00
                  WHEN tipo_vendedor = 'Exclusivo' THEN 3.00
                  ELSE 4.00
                END
              ),
              comissao_valor = (
                COALESCE(valor_venda, 0) * (
                  COALESCE(
                    (SELECT percentual_override FROM override_check),
                    (SELECT percentual_default FROM config_check),
                    CASE
                      WHEN tipo_vendedor = 'SDR' THEN 1.00
                      WHEN tipo_vendedor = 'Exclusivo' THEN 3.00
                      ELSE 4.00
                    END
                  ) / 100
                )
              ),
              comissao_bonus = CASE
                WHEN tipo_vendedor = 'Exclusivo' THEN 0
                ELSE COALESCE(
                  (SELECT taxa_fixa_override FROM override_check),
                  (SELECT taxa_fixa FROM config_check),
                  50.00
                )
              END,
              comissao_locked = true,
              updated_at = NOW()
          WHERE id = $1
        `, [projectId])
      }
    } else if (body.status_contato !== undefined && body.status_contato !== 'Fechado' && body.status_contato !== 'Aguardando Closer') {
      // Unlock commission if status changes away from Fechado
      // Always clear closer_id when status is not 'Aguardando Closer' or 'Fechado'
      // This ensures stale closer_id values don't cause Paulo to see leads he should not see
      await query(`
        UPDATE vendedor_projetos
        SET comissao_locked = false, comissao_valor = NULL, comissao_percentual = NULL, comissao_bonus = NULL,
            closer_comissao_percentual = NULL, closer_comissao_valor = NULL,
            closer_id = NULL
        WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL)
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
              CASE
                WHEN tipo_vendedor = 'SDR' THEN 1.00
                WHEN tipo_vendedor = 'Exclusivo' THEN 3.00
                ELSE 4.00
              END
            ),
            comissao_valor = (
              COALESCE(valor_venda, 0) * (
                COALESCE(
                  (SELECT percentual_default FROM config_check),
                  CASE
                    WHEN tipo_vendedor = 'SDR' THEN 1.00
                    WHEN tipo_vendedor = 'Exclusivo' THEN 3.00
                    ELSE 4.00
                  END
                ) / 100
              )
            ),
            comissao_bonus = CASE
              WHEN tipo_vendedor = 'Exclusivo' THEN 0
              ELSE COALESCE((SELECT taxa_fixa FROM config_check), 50.00)
            END,
            updated_at = NOW()
        WHERE id = $1 AND status_contato = 'Fechado'
      `, [projectId])
    }

    // Return updated commission data so frontend can refresh
    const updated = await query(
      `SELECT comissao_percentual, comissao_valor, comissao_bonus, tipo_vendedor, valor_venda, status_contato, closer_id, closer_comissao_percentual, closer_comissao_valor FROM vendedor_projetos WHERE id = $1`,
      [projectId]
    )

    return NextResponse.json({ success: true, ...(updated[0] || {}) })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
