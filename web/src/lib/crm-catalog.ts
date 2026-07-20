export const CRM_STATUS_CANONICAL = [
  'Não Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Quente',
  'Muito Quente',
  'Proposta Enviada',
  'Em Aprovação',
  'Fechado',
  'Telefone Invalido',
] as const

export const CRM_STATUS_SELECT_OPTIONS = [
  'Não Contatado',
  'Sem Interesse',
  'Em Atendimento',
  'Proposta Enviada',
  'Em Aprovação',
  'Vendas Concluídas',
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
  'Proposta Enviada': 'Proposta Enviada',
  'Em Aprovação': 'Em Aprovação',
  'Fechado': 'Fechado',
  'Vendas Concluídas': 'Fechado',
  // Filtros descontinuados — qualquer lead nesses status é tratado como Não Contatado
  'Telefone Invalido': 'Não Contatado',
  'Quente': 'Não Contatado',
  'Muito Quente': 'Não Contatado',
}

export function normalizeCrmStatus(status: string | null | undefined): CrmStatus {
  if (!status) return 'Não Contatado'
  return CRM_STATUS_ALIASES[status] || status as CrmStatus
}

export function formatCrmStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeCrmStatus(status)
  return normalized === 'Fechado' ? 'Vendas Concluídas' : normalized
}

export function isClosedCrmStatus(status: string | null | undefined): boolean {
  return normalizeCrmStatus(status) === 'Fechado'
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
