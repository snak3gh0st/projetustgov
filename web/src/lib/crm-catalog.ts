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
  'Telefone Invalido': 'Telefone Invalido',
  'Quente': 'Quente',
  'Muito Quente': 'Muito Quente',
}

export function normalizeCrmStatus(status: string | null | undefined): CrmStatus {
  if (!status) return 'Não Contatado'
  return CRM_STATUS_ALIASES[status] || status as CrmStatus
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

export const CRM_COMMISSIONS = {
  SDR: 1.5,
  CLOSER: 3.5,
  IN_SITES_SELLS: 5.0,
  CLOSER_SPLIT_BONUS: 50.0,
} as const
