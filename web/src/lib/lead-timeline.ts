import { normalizeCrmStatus } from './crm-catalog'
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
    events.forEach((event, i) => {
      items.push({ kind: 'evento', id: `evento-${event.created_at}-${event.tipo}-${i}`, at: event.created_at, event })
    })
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

/** Status de Execução/Prestação de um CNPJ: o mais avançado entre as linhas, como na lista de Execução. */
export function execucaoStatusDoCnpj(statuses: (string | null | undefined)[]): string {
  let best = 'Não Contatado'
  for (const raw of statuses) {
    const s = raw == null ? 'Não Contatado' : (SQL_ALIASES[raw] ?? raw)
    if ((ORDER[s] ?? 13) < (ORDER[best] ?? 13)) best = s
  }
  return normalizeCrmStatus(best)
}

/** Donos distintos das emendas do CNPJ, na ordem em que aparecem. */
export function responsaveis(rows: { vendedor_nome?: string | null }[]): string[] {
  return Array.from(new Set(rows.map((r) => r.vendedor_nome).filter((n): n is string => Boolean(n))))
}
