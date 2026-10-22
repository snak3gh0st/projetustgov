// Fonte única das cores de status do funil comercial (pílulas, pontos e barras).
// Etapas em andamento seguem uma progressão do azul da marca; ganhos em verde,
// perdas em tons quentes; "Não Contatado" fica neutro. O rótulo sempre acompanha a cor.

export type StatusTone = 'idle' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'won' | 'won2' | 'lost' | 'risk' | 'churn'

export interface StatusStyle {
  tone: StatusTone
  pill: string
  dot: string
  bar: string
  text: string
}

const TONES: Record<StatusTone, Omit<StatusStyle, 'tone'>> = {
  idle: {
    pill: 'bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700',
    dot: 'bg-neutral-400 dark:bg-neutral-500',
    bar: 'bg-neutral-300 dark:bg-neutral-600',
    text: 'text-neutral-700 dark:text-neutral-300',
  },
  p1: {
    pill: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25',
    dot: 'bg-sky-400',
    bar: 'bg-sky-400',
    text: 'text-sky-700 dark:text-sky-300',
  },
  p2: {
    pill: 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/25',
    dot: 'bg-blue-400',
    bar: 'bg-blue-400',
    text: 'text-blue-700 dark:text-blue-300',
  },
  p3: {
    pill: 'bg-blue-100 text-blue-900 ring-blue-300 dark:bg-blue-500/20 dark:text-blue-200 dark:ring-blue-400/30',
    dot: 'bg-blue-600',
    bar: 'bg-blue-600',
    text: 'text-blue-800 dark:text-blue-200',
  },
  p4: {
    pill: 'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25',
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  p5: {
    pill: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25',
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
  },
  won: {
    pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  won2: {
    pill: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/25',
    dot: 'bg-teal-500',
    bar: 'bg-teal-500',
    text: 'text-teal-700 dark:text-teal-300',
  },
  lost: {
    pill: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25',
    dot: 'bg-amber-500',
    bar: 'bg-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
  },
  risk: {
    pill: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/25',
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    text: 'text-orange-700 dark:text-orange-300',
  },
  churn: {
    pill: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

const STATUS_TONE: Record<string, StatusTone> = {
  'Não Contatado': 'idle',
  'Nao Contatado': 'idle',
  'Contactado': 'idle',
  'Quente': 'idle',
  'Muito Quente': 'idle',
  'Telefone Invalido': 'idle',
  'Contatado': 'p1',
  'Em Atendimento': 'p2',
  'Retorno': 'p2',
  'Reunião Agendada': 'p3',
  'Reuniao Agendada': 'p3',
  'Proposta Enviada': 'p4',
  'Proposta': 'p4',
  'Em Aprovação': 'p5',
  'Aprovação': 'p5',
  'Aguardando Closer': 'p5',
  'Fechado': 'won',
  'Vendas Concluídas': 'won',
  'Vendas Aprovação': 'won',
  'Execução/Prestação': 'won2',
  'Vendas Execução e Prestação': 'won2',
  'Sem Interesse': 'lost',
  'Ainda Não': 'lost',
  'Impedimento Técnico': 'risk',
  'Impedimento Tecnico': 'risk',
  'Cancelado': 'churn',
  'Churn': 'churn',
}

export function statusStyle(status: string | null | undefined): StatusStyle {
  const tone = STATUS_TONE[status ?? ''] ?? 'idle'
  return { tone, ...TONES[tone] }
}

// Desfechos (ganho/perda) ficam separados das etapas em andamento no funil.
export function isOutcomeStatus(status: string): boolean {
  const tone = STATUS_TONE[status] ?? 'idle'
  return tone === 'won' || tone === 'won2' || tone === 'lost' || tone === 'churn'
}
