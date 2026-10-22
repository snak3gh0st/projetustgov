import { isClosedCrmStatus, normalizeCrmStatus } from './crm-catalog'
import type { ContactNote } from './types'

// Linha do tempo do card do lead: notas de contato e movimentações (lead_events) numa lista só.

export type TimelineNote = ContactNote

/** Mesmo formato de LeadEvent (lib/lead-events.ts) e LeadEventView (components/LeadEvents). */
export interface TimelineEvent {
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

export type TimelineFilter = 'tudo' | 'notas' | 'movimentacoes'

export type TimelineItem =
  | { kind: 'nota'; id: string; at: string; note: TimelineNote }
  | { kind: 'evento'; id: string; at: string; event: TimelineEvent }

/** Ordem cronológica crescente: o mais recente fica embaixo, junto da caixa de nota. */
export function buildTimeline(notes: TimelineNote[], events: TimelineEvent[], filter: TimelineFilter): TimelineItem[] {
  const items: TimelineItem[] = []
  if (filter !== 'movimentacoes') {
    for (const note of notes) items.push({ kind: 'nota', id: `nota-${note.id}`, at: note.created_at, note })
  }
  if (filter !== 'notas') {
    // Chave pelo conteúdo: um evento novo não muda a chave dos que já estão na tela.
    const seen = new Map<string, number>()
    for (const event of events) {
      const base = `evento-${event.created_at}-${event.tipo}-${event.de ?? ''}-${event.para ?? ''}-${event.autor_nome ?? ''}`
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      items.push({ kind: 'evento', id: n === 0 ? base : `${base}-${n}`, at: event.created_at, event })
    }
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => new Date(a.item.at).getTime() - new Date(b.item.at).getTime() || a.index - b.index)
    .map(({ item }) => item)
}

/** Fase do convênio no TransfereGov, pela situação (mesma regra de execucaoFaseSql). */
export function faseDaSituacao(situacao: string | null | undefined): 'execucao' | 'prestacao_contas' | null {
  const s = (situacao ?? '').toLowerCase()
  if (s === 'em execução') return 'execucao'
  if (/presta.*contas/.test(s)) return 'prestacao_contas'
  return null
}

// normalizedStatusSql + normalizedStatusOrderSql (lib/execucao-status.ts), em TS.
const SQL_ALIASES: Record<string, string> = {
  'Nao Contatado': 'Não Contatado', 'Novo': 'Não Contatado', 'Contactado': 'Não Contatado',
  'Ainda Não': 'Sem Interesse', 'Retorno': 'Em Atendimento', 'Reuniao Agendada': 'Reunião Agendada',
  'Proposta': 'Proposta Enviada', 'Aguardando Closer': 'Em Aprovação', 'Impedimento Tecnico': 'Impedimento Técnico',
}
const ORDER: Record<string, number> = {
  'Fechado': 1, 'Em Aprovação': 2, 'Proposta Enviada': 3, 'Reunião Agendada': 4, 'Contatado': 5,
  'Em Atendimento': 6, 'Sem Interesse': 7, 'Impedimento Técnico': 8, 'Cancelado': 9, 'Quente': 10,
  'Muito Quente': 11, 'Telefone Invalido': 12, 'Não Contatado': 14,
}

/**
 * Status de Execução/Prestação de um CNPJ: o mais avançado entre as linhas, como na lista de Execução
 * (empate fica com a linha atualizada por último).
 */
export function execucaoStatusDoCnpj(rows: { status: string | null | undefined; updated_at: string | null | undefined }[]): string {
  let best: { s: string; rank: number; at: number } | null = null
  for (const row of rows) {
    const s = row.status == null ? 'Não Contatado' : (SQL_ALIASES[row.status] ?? row.status)
    const rank = ORDER[s] ?? 13
    const at = row.updated_at ? new Date(row.updated_at).getTime() : -Infinity
    if (!best || rank < best.rank || (rank === best.rank && at > best.at)) best = { s, rank, at }
  }
  return normalizeCrmStatus(best?.s ?? 'Não Contatado')
}

interface ContatoRow { id: number; principal: boolean; created_at: string; telefone: string | null; email: string | null }
export interface ValorExibido { valor: string | null; contatoId: number | null }

/**
 * O que o card mostra como telefone e email, com a mesma regra de /api/leads (primeiro contato,
 * principal antes, senão o do lead). contatoId diz onde gravar a edição: no contato ou no lead (null).
 */
export function contatoExibido(
  contatos: ContatoRow[],
  lead: { telefone: string | null; email: string | null }
): { telefone: ValorExibido; email: ValorExibido } {
  const first = [...contatos].sort((a, b) =>
    Number(b.principal) - Number(a.principal) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0]
  const pick = (campo: 'telefone' | 'email'): ValorExibido =>
    first?.[campo] ? { valor: first[campo], contatoId: first.id } : { valor: lead[campo], contatoId: null }
  return { telefone: pick('telefone'), email: pick('email') }
}

/** SaleModal só quando o lead entra em Vendas Concluídas; avançar a etapa de uma venda já fechada não abre. */
export function abreModalDeVenda(statusAtual: string | null | undefined, novo: string): boolean {
  return isClosedCrmStatus(novo) && normalizeCrmStatus(statusAtual) !== 'Fechado'
}

/** Donos distintos das emendas do CNPJ, na ordem em que aparecem. */
export function responsaveis(rows: { vendedor_nome?: string | null }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.vendedor_nome).filter((n): n is string => Boolean(n))))
}
