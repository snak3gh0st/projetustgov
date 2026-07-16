import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { isClosedCrmStatus, normalizeCrmStatus, normalizeTipoVendedor } from '@/lib/crm-catalog'

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
    const requestedStatus = body.status_contato !== undefined
      ? normalizeCrmStatus(String(body.status_contato))
      : undefined

    if (!projectId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const currentLead = await query<{
      status_contato: string | null
      vendedor_id: string | null
      closer_id: string | null
      valor_venda: string | number | null
    }>(
      `SELECT status_contato, vendedor_id, closer_id, valor_venda
       FROM vendedor_projetos
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    )
    const currentRow = currentLead[0]

    if (!currentRow) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const currentStatus = normalizeCrmStatus(currentRow.status_contato)

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (body.status_contato !== undefined) {
      updates.push(`status_contato = $${paramIndex++}`)
      values.push(requestedStatus)
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
      values.push(normalizeTipoVendedor(String(body.tipo_vendedor)))
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // VALIDATION: valor_venda must be provided and positive to close the sale
    // This check runs BEFORE the UPDATE to prevent invalid status changes
    if (isClosedCrmStatus(requestedStatus)) {
      const bodyValorVenda = body.valor_venda != null ? Number(body.valor_venda) : null
      if (bodyValorVenda != null && bodyValorVenda > 0) {
        // valor_venda was sent in this request — proceed
      } else {
        const existingValor = currentRow.valor_venda ? Number(currentRow.valor_venda) : 0
        if (!existingValor || existingValor <= 0) {
          return NextResponse.json(
            { error: 'valor_venda is required and must be > 0 to close the sale' },
            { status: 400 }
          )
        }
      }
    }

    if (requestedStatus === 'Em Aprovação' && session.role !== 'gestor' && currentStatus !== 'Proposta Enviada' && currentStatus !== 'Em Aprovação') {
      return NextResponse.json(
        { error: 'Only Proposta Enviada can move into Em Aprovação' },
        { status: 400 }
      )
    }

    if (isClosedCrmStatus(requestedStatus)) {
      if (session.role !== 'gestor') {
        return NextResponse.json({ error: 'Only gestores can move a lead to Vendas Concluídas' }, { status: 403 })
      }
      if (currentStatus !== 'Em Aprovação' && currentStatus !== 'Fechado') {
        return NextResponse.json(
          { error: 'Lead must pass through Em Aprovação before closing' },
          { status: 400 }
        )
      }
    }

    updates.push(`updated_at = NOW()`)
    values.push(projectId)

    // Vendedor/coordenador can update their own leads or leads where they are closer
    // Exception: setting Aguardando Closer is allowed on ANY lead (SDR hands off to closer)
    let vendedorCondition = ''
    if (session.role === 'vendedor' || session.role === 'coordenador') {
      if (normalizeCrmStatus(body.status_contato) !== 'Em Aprovação') {
        values.push(session.userId)
        vendedorCondition = `AND (vendedor_id = $${paramIndex + 1} OR closer_id = $${paramIndex + 1})`
      }
    }

    const updateResult = await query<{ id: number }>(`
      UPDATE vendedor_projetos
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} ${vendedorCondition}
      RETURNING id
    `, values)

    if (updateResult.length === 0) {
      return NextResponse.json({ error: 'Lead not found or permission denied' }, { status: 404 })
    }

    // Commission lock/unlock logic
    if (requestedStatus === 'Em Aprovação') {
      console.log(`[PATCH] Em Aprovação triggered for project ${projectId} by user ${session.userId} (${session.role})`)
      // SDR/vendedor sends lead to the current lead manager for approval
      // Set closer_id = manager/approver, keep vendedor_id as the original seller
      // Note: active filter removed so inactive accounts are still found (avoids silent failures)
      const managerEmail = process.env.PRIMARY_LEAD_MANAGER_EMAIL || 'rooger@projetus.org'
      const managerRes = await query(
        'SELECT id, nome, active FROM users WHERE email = $1 LIMIT 1',
        [managerEmail]
      )
      const managerCloserId = managerRes[0]?.id ?? null
      if (managerCloserId) {
        if (!managerRes[0]?.active) {
          console.warn(`[PATCH] lead manager account (${managerEmail}) is inactive — still assigning as closer`)
        }
        await query(`
          UPDATE vendedor_projetos
          SET closer_id = $2, updated_at = NOW()
          WHERE id = $1
        `, [projectId, managerCloserId])
        console.log(`[PATCH] closer_id set to ${managerCloserId} for project ${projectId}`)
      } else {
        console.error(`[PATCH] lead manager (${managerEmail}) NOT FOUND in users table — closer_id not set`)
      }
    } else if (isClosedCrmStatus(requestedStatus)) {
      // Step 1: Ensure vendedor_id is set. If NULL, assign current user as vendedor.
      await query(`
        UPDATE vendedor_projetos
        SET vendedor_id = $2, updated_at = NOW()
        WHERE id = $1 AND vendedor_id IS NULL
      `, [projectId, session.userId])

      // Check if this lead has a closer (split commission scenario)
      const leadCheck = await query(
        `SELECT closer_id, tipo_vendedor, valor_venda, vendedor_id FROM vendedor_projetos WHERE id = $1`,
        [projectId]
      )
      const leadRow = leadCheck[0]
      const approverId = leadRow?.closer_id || session.userId

      await query(`
        UPDATE vendedor_projetos
        SET comissao_percentual = 5.00,
            comissao_valor = COALESCE(valor_venda, 0) * 0.05,
            comissao_bonus = COALESCE(valor_venda, 0) * 0.02,
            closer_id = COALESCE(closer_id, $2),
            closer_comissao_percentual = 3.00,
            closer_comissao_valor = COALESCE(valor_venda, 0) * 0.03,
            comissao_locked = true,
            fechamento_at = COALESCE(fechamento_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `, [projectId, approverId])
    } else if (body.status_contato !== undefined && !isClosedCrmStatus(requestedStatus)) {
      // Unlock commission if status changes away from Vendas Concluídas / Em Aprovação
      // Always clear closer_id when status is not 'Em Aprovação' or 'Fechado'
      // This ensures stale closer_id values don't cause Paulo to see leads he should not see
      await query(`
        UPDATE vendedor_projetos
        SET comissao_locked = false, comissao_valor = NULL, comissao_percentual = NULL, comissao_bonus = NULL,
            closer_comissao_percentual = NULL, closer_comissao_valor = NULL,
            closer_id = NULL,
            fechamento_at = NULL
        WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL OR comissao_valor IS NOT NULL OR fechamento_at IS NOT NULL)
      `, [projectId])
    } else if (body.tipo_vendedor !== undefined && !body.status_contato) {
      // If tipo_vendedor changed and lead is already closed, recalculate commission
      // First check if lead has closer_id — must query DB since closer_id is server-side only
      const closerCheck = await query<{
        closer_id: string | null
        status_contato: string | null
      }>(
        `SELECT closer_id, status_contato FROM vendedor_projetos WHERE id = $1`,
        [projectId]
      )
      const closerRow = closerCheck[0]

      if (closerRow?.closer_id != null && isClosedCrmStatus(closerRow?.status_contato)) {
        // Re-apply the fixed 5% + 3% + 2% split for closed deals
        await query(`
          UPDATE vendedor_projetos
          SET comissao_percentual = 5.00,
              comissao_valor = COALESCE(valor_venda, 0) * 0.05,
              comissao_bonus = COALESCE(valor_venda, 0) * 0.02,
              closer_comissao_percentual = 3.00,
              closer_comissao_valor = COALESCE(valor_venda, 0) * 0.03,
              updated_at = NOW()
          WHERE id = $1
        `, [projectId])
      } else {
        // Standard commission recalc (no closer involved)
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
                5.00
              ),
              comissao_valor = (
                COALESCE(valor_venda, 0) * (
                  COALESCE(
                    (SELECT percentual_default FROM config_check),
                    5.00
                  ) / 100
                )
              ),
              comissao_bonus = COALESCE(valor_venda, 0) * 0.02,
              updated_at = NOW()
          WHERE id = $1 AND status_contato = 'Fechado'
        `, [projectId])
      }
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
