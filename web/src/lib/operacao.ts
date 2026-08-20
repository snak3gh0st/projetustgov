export type OperacaoPainel = 'execucao' | 'prestacao_contas'

export type OperacaoEtapa =
  | 'Aguardando execução'
  | 'Em execução'
  | 'Prestação de Contas'
  | 'Concluído'
  | 'Atenção'

export type OperacaoItemStatus = 'pendente' | 'em_andamento' | 'concluido' | 'nao_aplicavel'
export type OperacaoDocumentoStatus = 'pendente' | 'em_analise' | 'recebido' | 'aprovado' | 'rejeitado' | 'nao_aplicavel'

export const OPERACAO_CHECKLIST = [
  { key: 'contrato', label: 'Termo / contrato conferido' },
  { key: 'plano_trabalho', label: 'Plano de trabalho disponível' },
  { key: 'acompanhamento', label: 'Acompanhamento registrado' },
  { key: 'comprovantes', label: 'Comprovantes organizados' },
  { key: 'relatorio_execucao', label: 'Relatório de execução revisado' },
] as const

export const OPERACAO_DOCUMENTOS = [
  { key: 'termo_convenio', label: 'Termo de convênio' },
  { key: 'plano_trabalho', label: 'Plano de trabalho' },
  { key: 'extratos', label: 'Extratos e movimentações' },
  { key: 'notas_fiscais', label: 'Notas fiscais / comprovantes' },
  { key: 'prestacao_contas', label: 'Prestação de contas' },
] as const

export function normalizeOperacaoText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function getOperacaoEtapa(situacao: string | null | undefined): OperacaoEtapa {
  const normalized = normalizeOperacaoText(situacao)
  if (normalized.includes('rejeitad') || normalized.includes('complement')) return 'Atenção'
  if (normalized.includes('concluid') || normalized.includes('aprovad')) return 'Concluído'
  if (normalized.includes('prestacao de contas')) return 'Prestação de Contas'
  if (normalized.includes('execucao')) return 'Em execução'
  if (normalized.includes('cancelad')) return 'Atenção'
  return 'Aguardando execução'
}

export function getOperacaoPainel(situacao: string | null | undefined): OperacaoPainel {
  return normalizeOperacaoText(situacao).includes('prestacao de contas')
    ? 'prestacao_contas'
    : 'execucao'
}

export const OPERACAO_ETAPA_STYLES: Record<OperacaoEtapa, string> = {
  'Aguardando execução': 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  'Em execução': 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'Prestação de Contas': 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'Concluído': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'Atenção': 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

export const OPERACAO_CHECKLIST_STYLES: Record<OperacaoItemStatus, string> = {
  pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  em_andamento: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  concluido: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  nao_aplicavel: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export const OPERACAO_DOCUMENTO_STYLES: Record<OperacaoDocumentoStatus, string> = {
  pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  em_analise: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  recebido: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  aprovado: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejeitado: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  nao_aplicavel: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

export function formatOperacaoStatus(value: string): string {
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    nao_aplicavel: 'Não aplicável',
    em_analise: 'Em análise',
    recebido: 'Recebido',
    aprovado: 'Aprovado',
    rejeitado: 'Rejeitado',
  }
  return labels[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}
