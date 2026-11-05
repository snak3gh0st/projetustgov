export type Tipo = 'RECEITA' | 'DESPESA'

/** Summary of a parcela as returned by the contas-a-receber/pagar search. */
export type BuscaRow = {
  id: string
  tipo: Tipo
  status_busca: string | null
  descricao: string | null
  data_vencimento: string | null
  data_competencia: string | null
  valor_total: number
  valor_pago: number
  nao_pago: number
  pessoa_id: string | null
  pessoa_nome: string | null
  /** data_alteracao normalised to YYYY-MM-DDTHH:mm:ss (Sao Paulo local time). */
  ca_data_alteracao: string | null
  busca_payload: unknown
}

/** Fields read from GET /parcelas/{id}. */
export type ParcelaDetailRow = {
  id: string
  evento_id: string | null
  tipo: Tipo | null
  status: string | null
  descricao: string | null
  data_vencimento: string | null
  data_competencia: string | null
  data_pagamento_previsto: string | null
  valor_pago: number
  nao_pago: number
  perda: number | null
  conta_financeira_id: string | null
  origem: string | null
  conciliado: boolean | null
  quantidade_parcelas: number
  detail_alteracao: string | null
}

export type BaixaRow = {
  id: string
  parcela_id: string
  evento_id: string | null
  tipo: Tipo | null
  data_pagamento: string
  valor_bruto: number
  juros: number
  multa: number
  desconto: number
  taxa: number
  valor_liquido: number
  conta_financeira_id: string | null
  metodo_pagamento: string | null
  origem: string | null
}

export type RateioRow = {
  evento_id: string
  linha: number
  tipo: Tipo | null
  categoria_id: string | null
  categoria_nome: string | null
  centro_custo_id: string | null
  valor: number
  data_competencia: string | null
  origem: string | null
}

/** What the sweep needs to know about a parcela already in the database. */
export type StoredMeta = {
  ca_data_alteracao: string | null
  detail_alteracao: string | null
  has_payload: boolean
  deleted: boolean
}
