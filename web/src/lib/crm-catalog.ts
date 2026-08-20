export const CRM_STATUS_CANONICAL = [
  'Não Contatado',
  'Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Reunião Agendada',
  'Proposta Enviada',
  'Em Aprovação',
  'Fechado',
  'Churn',
] as const

/** Ordem do funil comercial ativo (pipeline / home). */
export const CRM_STATUS_FUNNEL_ORDER = [
  'Não Contatado',
  'Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Reunião Agendada',
  'Proposta Enviada',
  'Aprovação',
  'Vendas Aprovação',
  'Execução/Prestação',
  'Churn',
] as const

/** Opções de etapa comercial. Motivos de perda/bloqueio ficam no histórico. */
export const CRM_STATUS_SELECT_OPTIONS = [
  'Não Contatado',
  'Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Reunião Agendada',
  'Proposta Enviada',
  'Aprovação',
  // Subetapas da venda concluída, controladas pela gestão.
  'Vendas Aprovação',
  'Execução/Prestação',
  'Churn',
] as const

export const CRM_HISTORY_REASON_TYPES = [
  'impedimento_tecnico',
  'cancelamento',
] as const

export type CrmHistoryReasonType = typeof CRM_HISTORY_REASON_TYPES[number]

export const CRM_VENDA_ETAPAS = [
  'aprovacao',
  'execucao_prestacao',
] as const

export type CrmVendaEtapa = typeof CRM_VENDA_ETAPAS[number]

export type CrmStatus = typeof CRM_STATUS_CANONICAL[number]

export const CRM_STATUS_ALIASES: Record<string, CrmStatus> = {
  'Não Contatado': 'Não Contatado',
  'Nao Contatado': 'Não Contatado',
  'Ainda Não': 'Sem Interesse',
  'Sem Interesse': 'Sem Interesse',
  'Retorno': 'Em Atendimento',
  'Proposta': 'Proposta Enviada',
  'Aguardando Closer': 'Em Aprovação',
  'Aprovação': 'Em Aprovação',
  'Em Atendimento': 'Em Atendimento',
  'Contatado': 'Contatado',
  'Reunião Agendada': 'Reunião Agendada',
  'Reuniao Agendada': 'Reunião Agendada',
  'Proposta Enviada': 'Proposta Enviada',
  'Em Aprovação': 'Em Aprovação',
  'Fechado': 'Fechado',
  'Vendas Concluídas': 'Fechado',
  'Vendas Aprovação': 'Fechado',
  'Execução/Prestação': 'Fechado',
  'Churn': 'Churn',
  'Vendas Execução e Prestação': 'Fechado',
  'Vendas Execução e Prestação de Contas': 'Fechado',
  // Filtros descontinuados — qualquer lead nesses status volta para uma etapa comercial.
  'Telefone Invalido': 'Não Contatado',
  'Quente': 'Não Contatado',
  'Muito Quente': 'Não Contatado',
  'Contactado': 'Não Contatado', // legado (sem acento) ≠ Contatado
  'Impedimento Técnico': 'Em Atendimento',
  'Impedimento Tecnico': 'Em Atendimento',
  'Cancelado': 'Em Atendimento',
}

/** Cores Tailwind para badges de status (light + dark). */
export const CRM_STATUS_BADGE_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300',
  'Contatado': 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'Sem Interesse': 'bg-gray-50 dark:bg-gray-500/15 text-gray-600 dark:text-gray-300',
  'Em Atendimento': 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'Reunião Agendada': 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'Proposta Enviada': 'bg-blue-50 dark:bg-blue-500/15 text-[#0072F7]',
  'Aprovação': 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'Em Aprovação': 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'Vendas Aprovação': 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300',
  'Execução/Prestação': 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'Churn': 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'Fechado': 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300',
}

export function normalizeCrmStatus(status: string | null | undefined): CrmStatus {
  if (!status) return 'Não Contatado'
  return CRM_STATUS_ALIASES[status] || (status as CrmStatus)
}

export function normalizeVendaEtapa(value: string | null | undefined): CrmVendaEtapa | null {
  if (!value) return null
  if (value === 'aprovacao' || value === 'Vendas Aprovação') return 'aprovacao'
  if (value === 'execucao_prestacao' || value === 'Execução/Prestação' || value === 'Vendas Execução e Prestação' || value === 'Vendas Execução e Prestação de Contas') return 'execucao_prestacao'
  return null
}

export function formatCrmStatusLabel(status: string | null | undefined, vendaEtapa?: string | null): string {
  const normalized = normalizeCrmStatus(status)
  if (normalized === 'Em Aprovação') return 'Aprovação'
  if (normalized === 'Fechado') {
    return normalizeVendaEtapa(vendaEtapa) === 'execucao_prestacao'
      ? 'Execução/Prestação'
      : 'Vendas Aprovação'
  }
  return normalized
}

export function isClosedCrmStatus(status: string | null | undefined): boolean {
  return normalizeCrmStatus(status) === 'Fechado'
}

export function isCrmHistoryReasonStatus(status: string | null | undefined): boolean {
  return status === 'Impedimento Técnico' || status === 'Impedimento Tecnico' || status === 'Cancelado'
}

export function isManagementCrmStatus(status: string | null | undefined): boolean {
  const normalized = normalizeCrmStatus(status)
  return normalized === 'Em Aprovação' || normalized === 'Fechado' || normalized === 'Churn'
}

/** Tipo de serviço fechado — tag para operacional. */
export const CRM_TIPO_SERVICO = [
  'Aprovação',
  'Execução',
  'Prestação de Contas',
] as const

export type CrmTipoServico = typeof CRM_TIPO_SERVICO[number]

export function normalizeTipoServico(tipo: string | null | undefined): CrmTipoServico | null {
  if (!tipo) return null
  if ((CRM_TIPO_SERVICO as readonly string[]).includes(tipo)) return tipo as CrmTipoServico
  if (tipo === 'Aprovacao') return 'Aprovação'
  if (tipo === 'Execucao') return 'Execução'
  if (tipo === 'Prestacao de Contas' || tipo === 'PC') return 'Prestação de Contas'
  return null
}

export const CRM_TIPO_VENDEDOR = {
  SDR: 'SDR',
  CLOSER: 'Closer',
  IN_SITES_SELLS: 'In-Sites Sells',
} as const

export type CrmTipoVendedor =
  | typeof CRM_TIPO_VENDEDOR.SDR
  | typeof CRM_TIPO_VENDEDOR.CLOSER
  | typeof CRM_TIPO_VENDEDOR.IN_SITES_SELLS
  | 'Exclusivo'

export function normalizeTipoVendedor(tipo: string | null | undefined): CrmTipoVendedor {
  if (!tipo) return CRM_TIPO_VENDEDOR.SDR
  if (tipo === 'Exclusivo') return CRM_TIPO_VENDEDOR.IN_SITES_SELLS
  if (tipo === 'In-Sites Sells') return CRM_TIPO_VENDEDOR.IN_SITES_SELLS
  if (tipo === 'Closer') return CRM_TIPO_VENDEDOR.CLOSER
  return CRM_TIPO_VENDEDOR.SDR
}

// Modelo fixo, sem divisão SDR/Closer: todo fechamento paga 5% consultor + 3% gestor + 2% fundo comercial.
export const CRM_COMMISSIONS = {
  CONSULTOR: 5.0,
  GESTOR: 3.0,
  FUNDO_COMERCIAL: 2.0,
} as const
