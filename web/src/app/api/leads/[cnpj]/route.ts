import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'
import { isClosedCrmStatus, isCrmHistoryReasonStatus, isManagementCrmStatus, normalizeCrmStatus, normalizeTipoServico, normalizeTipoVendedor, normalizeVendaEtapa } from '@/lib/crm-catalog'

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
    const rawRequestedStatus = body.status_contato !== undefined ? String(body.status_contato) : undefined
    if (rawRequestedStatus && isCrmHistoryReasonStatus(rawRequestedStatus)) {
      return NextResponse.json(
        { error: 'Impedimento técnico e cancelamento são motivos do histórico. Registre uma observação no histórico sem alterar a etapa do funil.' },
        { status: 400 }
      )
    }
    const requestedStatus = rawRequestedStatus !== undefined
      ? normalizeCrmStatus(rawRequestedStatus)
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
      venda_etapa: string | null
    }>(
      `SELECT status_contato, vendedor_id, closer_id, valor_venda, contrato_assinado, venda_etapa
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
    const currentVendaEtapa = normalizeVendaEtapa(currentRow.venda_etapa)
    const requestedVendaEtapa = requestedStatus === 'Fechado'
      ? normalizeVendaEtapa(body.venda_etapa) || normalizeVendaEtapa(rawRequestedStatus) || currentVendaEtapa || 'aprovacao'
      : null
    const canManagePipeline = session.role === 'gestor' || session.role === 'admin'

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (body.status_contato !== undefined) {
      updates.push(`status_contato = $${paramIndex++}`)
      values.push(requestedStatus)
      updates.push(`venda_etapa = $${paramIndex++}`)
      values.push(requestedVendaEtapa)
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
    if (body.tipo_servico !== undefined) {
      const tipo = normalizeTipoServico(String(body.tipo_servico))
      if (!tipo) {
        return NextResponse.json(
          { error: 'tipo_servico must be Aprovação, Execução or Prestação de Contas' },
          { status: 400 }
        )
      }
      updates.push(`tipo_servico = $${paramIndex++}`)
      values.push(tipo)
    }
    if (body.tipo_vendedor !== undefined) {
      updates.push(`tipo_vendedor = $${paramIndex++}`)
      values.push(normalizeTipoVendedor(String(body.tipo_vendedor)))
    }
    if (body.contrato_assinado !== undefined) {
      if (!canManagePipeline) {
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

    if (requestedStatus !== undefined && isManagementCrmStatus(requestedStatus) && !canManagePipeline && requestedStatus !== currentStatus) {
      return NextResponse.json({ error: 'A partir de Aprovação, somente Rooger/gestão pode mover a etapa do funil' }, { status: 403 })
    }

    if (requestedStatus !== undefined && isClosedCrmStatus(requestedStatus) && currentStatus !== 'Fechado') {
      if (!canManagePipeline) {
        return NextResponse.json({ error: 'Somente Rooger/gestão pode mover uma venda para as etapas finais' }, { status: 403 })
      }
      if (currentStatus !== 'Em Aprovação') {
        return NextResponse.json(
          { error: 'O lead deve passar por Aprovação antes de entrar em Vendas Aprovação' },
          { status: 400 }
        )
      }
      if (requestedVendaEtapa !== 'aprovacao') {
        return NextResponse.json(
          { error: 'A primeira etapa de venda deve ser Vendas Aprovação; depois a gestão pode avançar para Execução e Prestação' },
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

    if (requestedStatus === 'Em Aprovação' && currentStatus !== 'Em Aprovação' && currentStatus !== 'Proposta Enviada') {
      return NextResponse.json({ error: 'Aprovação só pode ser iniciada depois de Proposta Enviada' }, { status: 400 })
    }

    if (requestedStatus === 'Fechado' && currentStatus === 'Fechado' && currentVendaEtapa !== requestedVendaEtapa) {
      if (!canManagePipeline) {
        return NextResponse.json({ error: 'Somente Rooger/gestão pode avançar a etapa final da venda' }, { status: 403 })
      }
      if (!(currentVendaEtapa === 'aprovacao' && requestedVendaEtapa === 'execucao_prestacao')) {
        return NextResponse.json({ error: 'A etapa final deve avançar de Vendas Aprovação para Vendas Execução e Prestação de Contas' }, { status: 400 })
      }
    }

    updates.push(`updated_at = NOW()`)
    values.push(projectId)

    // Vendedor/coordenador can update their own leads or leads where they are closer.
    // They cannot move the funnel past Proposta Enviada.
    let vendedorCondition = ''
    if (session.role === 'vendedor' || session.role === 'coordenador') {
      if (requestedStatus !== undefined && isManagementCrmStatus(requestedStatus)) {
        return NextResponse.json({ error: 'Vendedor só pode mover o lead até Proposta Enviada' }, { status: 403 })
      }
      values.push(session.userId)
      vendedorCondition = `AND (vendedor_id = $${paramIndex + 1} OR closer_id = $${paramIndex + 1})`
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

    // Return updated commission data so frontend can refresh.
    // comissao_bonus (fundo comercial) and closer_comissao_valor (gestor override) are
    // management-only figures — mirror the role gating already applied in /api/comissoes.
    const updated = await query<Record<string, unknown>>(
      `SELECT comissao_percentual, comissao_valor, comissao_bonus, tipo_vendedor, valor_venda, tipo_servico, status_contato, venda_etapa, closer_id, closer_comissao_percentual, closer_comissao_valor, contrato_assinado FROM vendedor_projetos WHERE id = $1`,
      [projectId]
    )
    const updatedRow = updated[0] || {}
    if (session.role !== 'gestor') {
      updatedRow.comissao_bonus = 0
      updatedRow.closer_comissao_valor = 0
    }

    return NextResponse.json({ success: true, ...updatedRow })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
