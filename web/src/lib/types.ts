export interface Lead {
  id: number
  cnpj: string
  nome: string
  natureza_juridica: string | null
  estado: string | null
  municipio: string | null
  cep: string | null
  endereco: string | null
  bairro: string | null
  total_propostas: number
  total_emendas: number
  valor_total_emendas: number
  total_convenios: number
  valor_total_desembolsos: number
  email: string | null
  telefone: string | null
  is_osc: boolean
  is_existing_client: boolean
  ministerios?: string | null
  tier_classification?: string
}

export interface Stats {
  total_leads: number
  existing_clients: number
  new_leads: number
  total_emendas: number
  total_valor_emendas: number
  avg_propostas: number
  high_value_leads: number
  total_convenios: number
  total_valor_desembolsos: number
}

export interface Emenda {
  numero_emenda: string | null
  parlamentar: string | null
  valor_emenda: number | null
  tipo_emenda: string | null
  apoiador_nome: string | null
  ministerio: string | null
}

export interface Proposta {
  transfer_gov_id: string
  titulo: string | null
  situacao: string | null
  valor_global: number | null
  valor_repasse: number | null
  data_publicacao: string | null
  programa_nome: string | null
}

export interface Ministerio {
  orgao: string
  count: number
}

export interface Programa {
  programa_nome: string
  programa_id: string
  count: number
}

export interface Instrument {
  nr_instrumento: string
  modalidade: string | null
  situacao: string | null
  instrumento_ativo: string | null
  tem_emenda: string
  parlamentar: string | null
  valor_global: number | null
  valor_emenda: number | null
  valor_empenhado: number | null
  valor_liberado: number | null
  saldo_conta: number | null
  valor_repasse: number | null
  valor_contrapartida: number | null
  valor_global_original: number | null
  rendimento_aplicacao: number | null
  ingresso_contrapartida: number | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
}

export interface InstrumentSummary {
  total_instrumentos: number
  total_valor_global: number
  total_empenhado: number
  total_liberado: number
  total_saldo_conta: number
  instrumentos_ativos: number
}

export interface EstadoData {
  estado: string
  total_proponentes: number
  total_emendas: number
  total_valor_emendas: number
}

export interface ValueDistribution {
  faixa: string
  quantidade: number
}

export interface TrendData {
  periodo: string
  total_propostas: number
  valor_total: number
}

// CRM Auth Types
export interface CRMUser {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'vendedor'
  active: boolean
}
