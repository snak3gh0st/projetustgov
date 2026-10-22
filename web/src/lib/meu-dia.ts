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

export function classifyMeuDia(candidates: MeuDiaCandidate[], now: Date): MeuDia {
  const novos: MeuDiaItem[] = []
  const parados: MeuDiaItem[] = []
  const reunioes: MeuDiaItem[] = []

  for (const c of candidates) {
    if (c.status === 'Reunião Agendada') {
      reunioes.push({ ...c, motivo: 'reuniao' })
      continue
    }
    if (c.status === 'Não Contatado' && c.atribuido_em) {
      const idade = now.getTime() - new Date(c.atribuido_em).getTime()
      if (idade <= NOVO_JANELA_DIAS * DAY_MS) {
        novos.push({ ...c, motivo: 'novo' })
        continue
      }
    }
    if (c.dias_sem_contato != null && c.dias_sem_contato > PARADO_DIAS && !DESFECHOS.has(c.status)) {
      parados.push({ ...c, motivo: 'parado' })
    }
  }

  novos.sort((a, b) => new Date(b.atribuido_em!).getTime() - new Date(a.atribuido_em!).getTime())
  parados.sort((a, b) => (b.dias_sem_contato ?? 0) - (a.dias_sem_contato ?? 0))
  reunioes.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))

  return { novos, parados, reunioes }
}
