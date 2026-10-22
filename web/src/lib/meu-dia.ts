import { normalizeCrmStatus } from './crm-catalog'

// Regras do "Meu dia": o que o consultor tem para fazer hoje, a partir dos leads dele.
// Sem comissão e sem números da equipe.

export type MeuDiaFunil = 'aprovacao' | 'execucao' | 'prestacao_contas'

export interface MeuDiaCandidate {
  cnpj: string
  nome: string | null
  municipio: string | null
  uf: string | null
  funil: MeuDiaFunil
  /** Status já normalizado (normalizeCrmStatus). */
  status: string
  /** Última atribuição ao consultor; sem evento, a criação do lead. */
  atribuido_em: string | null
  dias_sem_contato: number | null
}

export interface MeuDiaItem extends MeuDiaCandidate {
  motivo: 'novo' | 'parado' | 'reuniao'
}

export interface MeuDia {
  novos: MeuDiaItem[]
  parados: MeuDiaItem[]
  reunioes: MeuDiaItem[]
}

export const NOVO_JANELA_DIAS = 7
export const PARADO_DIAS = 7

// Desfechos e motivos de histórico: o lead não espera mais contato.
const DESFECHOS = new Set(['Fechado', 'Sem Interesse', 'Churn', 'Impedimento Técnico', 'Cancelado'])

const DAY_MS = 86_400_000

/** Status para classificar: normaliza, mas mantém os motivos de histórico que o catálogo converte em Em Atendimento. */
export function meuDiaStatus(raw: string | null | undefined): string {
  if (raw === 'Cancelado' || raw === 'Impedimento Técnico') return raw
  return normalizeCrmStatus(raw)
}

/** Dias de calendário entre duas datas, no fuso de quem chama (ontem às 17h e hoje às 9h = 1). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((end - start) / DAY_MS)
}

const PRECEDENCE: Record<MeuDiaItem['motivo'], number> = { reuniao: 0, novo: 1, parado: 2 }

function classify(c: MeuDiaCandidate, now: Date): MeuDiaItem['motivo'] | null {
  if (c.status === 'Reunião Agendada') return 'reuniao'
  if (c.status === 'Não Contatado' && c.atribuido_em) {
    const idade = now.getTime() - new Date(c.atribuido_em).getTime()
    if (idade <= NOVO_JANELA_DIAS * DAY_MS) return 'novo'
  }
  if (c.dias_sem_contato != null && c.dias_sem_contato > PARADO_DIAS && !DESFECHOS.has(c.status)) return 'parado'
  return null
}

/**
 * Candidatos podem vir por emenda (Aprovação tem status por linha). Cada CNPJ aparece uma vez por funil,
 * na lista mais urgente entre as emendas dele: reunião, depois novo, depois parado.
 */
export function classifyMeuDia(candidates: MeuDiaCandidate[], now: Date): MeuDia {
  const best = new Map<string, MeuDiaItem>()
  for (const c of candidates) {
    const motivo = classify(c, now)
    if (!motivo) continue
    const key = `${c.funil}|${c.cnpj}`
    const current = best.get(key)
    const better = !current
      || PRECEDENCE[motivo] < PRECEDENCE[current.motivo]
      || (motivo === 'novo' && current.motivo === 'novo' && (c.atribuido_em ?? '') > (current.atribuido_em ?? ''))
    if (better) best.set(key, { ...c, motivo })
  }

  const novos: MeuDiaItem[] = []
  const parados: MeuDiaItem[] = []
  const reunioes: MeuDiaItem[] = []
  for (const item of Array.from(best.values())) {
    if (item.motivo === 'novo') novos.push(item)
    else if (item.motivo === 'parado') parados.push(item)
    else reunioes.push(item)
  }

  novos.sort((a, b) => new Date(b.atribuido_em!).getTime() - new Date(a.atribuido_em!).getTime())
  parados.sort((a, b) => (b.dias_sem_contato ?? 0) - (a.dias_sem_contato ?? 0))
  reunioes.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))

  return { novos, parados, reunioes }
}
