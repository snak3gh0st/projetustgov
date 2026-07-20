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
      contrato_assinado: boolean | null
    }>(
      `SELECT status_contato, vendedor_id, closer_id, valor_venda, contrato_assinado
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
    if (body.contrato_assinado !== undefined) {
      if (session.role !== 'gestor') {
        return NextResponse.json({ error: 'Only gestores can confirm contrato_assinado' }, { status: 403 })
      }
      updates.push(`contrato_assinado = $${paramIndex++}`)
      values.push(Boolean(body.contrato_assinado))
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

    if (isClosedCrmStatus(requestedStatus) && currentStatus !== 'Fechado') {
      if (session.role !== 'gestor') {
        return NextResponse.json({ error: 'Only gestores can move a lead to Vendas Concluídas' }, { status: 403 })
      }
      if (currentStatus !== 'Em Aprovação') {
        return NextResponse.json(
          { error: 'Lead must pass through Em Aprovação before closing' },
          { status: 400 }
        )
      }
      const contratoAssinado = body.contrato_assinado === true ? true : Boolean(currentRow.contrato_assinado)
      if (!contratoAssinado) {
        return NextResponse.json(
          { error: 'contrato_assinado deve ser confirmado antes de autorizar o fechamento' },
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
      // Apenas troca o status — sem auto-assign de closer_id. O lead segue "pertencendo"
      // ao vendedor que negociou até o gestor autorizar o fechamento.
      console.log(`[PATCH] Em Aprovação triggered for project ${projectId} by user ${session.userId} (${session.role})`)
    } else if (isClosedCrmStatus(requestedStatus) && currentStatus !== 'Fechado') {
      // Autorização de fechamento — só chega aqui como gestor, com contrato_assinado confirmado (gate acima).
      // Step 1: Ensure vendedor_id is set. If NULL, assign current user as vendedor.
      await query(`
        UPDATE vendedor_projetos
        SET vendedor_id = $2, updated_at = NOW()
        WHERE id = $1 AND vendedor_id IS NULL
      `, [projectId, session.userId])

      const leadCheck = await query<{ vendedor_id: string | null; valor_venda: string | number | null; nome: string | null }>(
        `SELECT vendedor_id, valor_venda, nome FROM vendedor_projetos WHERE id = $1`,
        [projectId]
      )
      const leadRow = leadCheck[0]

      // Modelo fixo: 5% consultor (vendedor da venda) + 3% gestor (quem autoriza) + 2% fundo comercial.
      // Se o próprio gestor vendeu, ele acumula os dois papéis (8% nessa venda).
      await query(`
        UPDATE vendedor_projetos
        SET comissao_percentual = 5.00,
            comissao_valor = COALESCE(valor_venda, 0) * 0.05,
            comissao_bonus = COALESCE(valor_venda, 0) * 0.02,
            closer_id = $2,
            closer_comissao_percentual = 3.00,
            closer_comissao_valor = COALESCE(valor_venda, 0) * 0.03,
            comissao_locked = true,
            fechamento_at = COALESCE(fechamento_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `, [projectId, session.userId])

      const fundoComercialValor = Number(leadRow?.valor_venda || 0) * 0.02
      if (fundoComercialValor > 0) {
        await query(`
          INSERT INTO fundo_comercial_lancamentos (tipo, valor, descricao, lead_id, criado_por)
          VALUES ('credito', $1, $2, $3, $4)
        `, [fundoComercialValor, `Fechamento: ${leadRow?.nome || 'lead'} (#${projectId})`, projectId, session.userId])
      }
    } else if (body.status_contato !== undefined && !isClosedCrmStatus(requestedStatus)) {
      // Unlock commission if status changes away from Vendas Concluídas / Em Aprovação
      await query(`
        UPDATE vendedor_projetos
        SET comissao_locked = false, comissao_valor = NULL, comissao_percentual = NULL, comissao_bonus = NULL,
            closer_comissao_percentual = NULL, closer_comissao_valor = NULL,
            closer_id = NULL,
            contrato_assinado = false,
            fechamento_at = NULL
        WHERE id = $1 AND (comissao_locked = true OR closer_id IS NOT NULL OR comissao_valor IS NOT NULL OR fechamento_at IS NOT NULL)
      `, [projectId])
    }

    // Return updated commission data so frontend can refresh
    const updated = await query(
      `SELECT comissao_percentual, comissao_valor, comissao_bonus, tipo_vendedor, valor_venda, status_contato, closer_id, closer_comissao_percentual, closer_comissao_valor, contrato_assinado FROM vendedor_projetos WHERE id = $1`,
      [projectId]
    )

    return NextResponse.json({ success: true, ...(updated[0] || {}) })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
