import 'server-only'

import { query } from './db'
import { formatCrmStatusLabel } from './crm-catalog'

// Histórico de movimentação gravado pelo trigger trg_lead_events
// (migrations/create_lead_events.sql).

export interface LeadEvent {
  cnpj: string
  nome: string | null
  tipo: 'status' | 'status_execucao' | 'atribuicao'
  de: string | null
  para: string | null
  autor_nome: string | null
  origem: string
  linhas: number
  comissao_valor: number | null
  created_at: string
}

// Origens automáticas: ficam no histórico do lead, mas fora da Atividade Recente.
export const AUTOMATIC_ORIGINS = ['sistema', 'sincronizacao']

let tableReady = false

// Tolera deploy antes da migração: sem a tabela, não há histórico.
export async function leadEventsReady(): Promise<boolean> {
  if (tableReady) return true
  const rows = await query<{ ok: boolean }>(`SELECT to_regclass('public.lead_events') IS NOT NULL AS ok`)
  tableReady = Boolean(rows[0]?.ok)
  return tableReady
}

/**
 * Um CNPJ tem várias linhas (uma por emenda) e atribuição/status por CNPJ
 * gera um evento por linha. Agrupa a mesma mudança, do mesmo autor, no mesmo minuto.
 * `where` recebe o alias `e` (lead_events) e `vp` (vendedor_projetos).
 */
export async function fetchLeadEvents(
  where: string,
  params: unknown[],
  limit: number,
  opts: { includeCommission: boolean }
): Promise<LeadEvent[]> {
  const rows = await query<Record<string, unknown>>(`
    SELECT
      e.cnpj,
      MAX(e.nome) AS nome,
      e.tipo,
      e.valor_anterior,
      e.valor_novo,
      MAX(va.nome) AS vendedor_anterior_nome,
      MAX(vn.nome) AS vendedor_novo_nome,
      MAX(au.nome) AS autor_nome,
      e.origem,
      COUNT(*)::int AS linhas,
      SUM(e.comissao_valor) AS comissao_valor,
      MAX(e.created_at) AS created_at
    FROM lead_events e
    LEFT JOIN vendedor_projetos vp ON vp.id = e.lead_id
    LEFT JOIN users va ON va.id = e.vendedor_anterior_id
    LEFT JOIN users vn ON vn.id = e.vendedor_novo_id
    LEFT JOIN users au ON au.id = e.user_id
    WHERE ${where}
    GROUP BY e.cnpj, e.tipo, e.valor_anterior, e.valor_novo, e.vendedor_anterior_id, e.vendedor_novo_id,
             e.user_id, e.origem, date_trunc('minute', e.created_at)
    ORDER BY MAX(e.created_at) DESC
    LIMIT ${Math.max(1, Math.floor(limit))}
  `, params)

  return rows.map((r) => {
    const tipo = r.tipo as LeadEvent['tipo']
    const isAtribuicao = tipo === 'atribuicao'
    // Status de execução tem funil próprio (Quente, Muito Quente…): sem os aliases do CRM.
    const status = (v: unknown) => tipo === 'status'
      ? formatCrmStatusLabel(v as string | null)
      : ((v as string | null) ?? 'Não Contatado')
    return {
      cnpj: r.cnpj as string,
      nome: (r.nome as string | null) ?? null,
      tipo,
      de: isAtribuicao
        ? ((r.vendedor_anterior_nome as string | null) ?? null)
        : status(r.valor_anterior),
      para: isAtribuicao
        ? ((r.vendedor_novo_nome as string | null) ?? null)
        : status(r.valor_novo),
      autor_nome: (r.autor_nome as string | null) ?? null,
      origem: r.origem as string,
      linhas: Number(r.linhas) || 1,
      // Comissionamento: visível apenas para o gestor comercial
      comissao_valor: opts.includeCommission && r.comissao_valor != null ? Number(r.comissao_valor) : null,
      created_at: new Date(r.created_at as string).toISOString(),
    }
  })
}
