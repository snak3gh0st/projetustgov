export const CRM_STATUS_CANONICAL = [
  'Não Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Contatado',
  'Reunião Agendada',
  'Quente',
  'Muito Quente',
  'Proposta Enviada',
  'Em Aprovação',
  'Fechado',
  'Impedimento Técnico',
  'Cancelado',
  'Telefone Invalido',
] as const

/** Ordem do funil comercial ativo (pipeline / home). */
export const CRM_STATUS_FUNNEL_ORDER = [
  'Não Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Contatado',
  'Reunião Agendada',
  'Proposta Enviada',
  'Em Aprovação',
  'Fechado',
] as const

/** Opções do dropdown de status (inclui pós-venda). */
export const CRM_STATUS_SELECT_OPTIONS = [
  'Não Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Contatado',
  'Reunião Agendada',
  'Proposta Enviada',
  'Em Aprovação',
  'Vendas Concluídas',
  'Impedimento Técnico',
  'Cancelado',
] as const

export type CrmStatus = typeof CRM_STATUS_CANONICAL[number]

export const CRM_STATUS_ALIASES: Record<string, CrmStatus> = {
  'Não Contatado': 'Não Contatado',
  'Nao Contatado': 'Não Contatado',
  'Ainda Não': 'Sem Interesse',
  'Retorno': 'Em Atendimento',
  'Proposta': 'Proposta Enviada',
  'Aguardando Closer': 'Em Aprovação',
  'Sem Interesse': 'Sem Interesse',
  'Em Atendimento': 'Em Atendimento',
  'Contatado': 'Contatado',
  'Reunião Agendada': 'Reunião Agendada',
  'Reuniao Agendada': 'Reunião Agendada',
  'Proposta Enviada': 'Proposta Enviada',
  'Em Aprovação': 'Em Aprovação',
  'Fechado': 'Fechado',
  'Vendas Concluídas': 'Fechado',
  'Impedimento Técnico': 'Impedimento Técnico',
  'Impedimento Tecnico': 'Impedimento Técnico',
  'Cancelado': 'Cancelado',
  // Filtros descontinuados — qualquer lead nesses status é tratado como Não Contatado
  'Telefone Invalido': 'Não Contatado',
  'Quente': 'Não Contatado',
  'Muito Quente': 'Não Contatado',
  'Contactado': 'Não Contatado', // legado (sem acento) ≠ Contatado
}

/** Cores Tailwind para badges de status (light + dark). */
export const CRM_STATUS_BADGE_COLORS: Record<string, string> = {
  'Não Contatado': 'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300',
  'Sem Interesse': 'bg-gray-50 dark:bg-gray-500/15 text-gray-600 dark:text-gray-300',
  'Em Atendimento': 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300',
  'Contatado': 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'Reunião Agendada': 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  'Proposta Enviada': 'bg-blue-50 dark:bg-blue-500/15 text-[#0072F7]',
  'Em Aprovação': 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300',
  'Fechado': 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-300',
  'Impedimento Técnico': 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'Cancelado': 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300',
}

export function normalizeCrmStatus(status: string | null | undefined): CrmStatus {
  if (!status) return 'Não Contatado'
  return CRM_STATUS_ALIASES[status] || (status as CrmStatus)
}

export function formatCrmStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeCrmStatus(status)
  return normalized === 'Fechado' ? 'Vendas Concluídas' : normalized
}

export function isClosedCrmStatus(status: string | null | undefined): boolean {
  return normalizeCrmStatus(status) === 'Fechado'
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
