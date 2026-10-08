import type { CategoriaLine, CrmStatus, DreOutRow, ParcelStatus, ProjectionPoint, WeekRow } from './assemble'

export type TipoTitulo = 'RECEITA' | 'DESPESA'

export type TituloRow = {
  id: string
  tipo: TipoTitulo
  data_vencimento: string | null
  pessoa_nome: string | null
  descricao: string | null
  categoria: string | null
  valor_total: number
  valor_pago: number
  nao_pago: number
  status: ParcelStatus
}

export type ResultadoMes = {
  mes: string
  faturamento: number
  deducoes: number
  custos: number
  despesas: number
  outros: number
  resultado: number
}

export type Overview = {
  today: string
  saldo: { total: number | null; contas: number; data: string | null; variacao30: number | null }
  saldoSerie: { date: string; balance: number }[]
  projecao: ProjectionPoint[]
  proximos7: TituloRow[]
  atrasados: { total: number; count: number; top: TituloRow[] }
  resultado: { atual: ResultadoMes | null; anterior: ResultadoMes | null; foraDoDre: number; mtd: { atual: number; mesmoPontoAnterior: number; diasUteis: number } }
  receber: { aging: number[]; aberto: number; vencido: number; inadimplencia: number; inadimplenciaSerie: { mes: string; taxa: number }[] }
  pagar: { semanas: { from: string; to: string; valor: number }[]; atrasados: { count: number; total: number; nomes: string[] } }
  posicao: { saldo: number; receber: number; pagar: number; emprestimos: number; liquida: number }
}

export type ResultadoResponse = {
  months: string[]
  regime: 'comp' | 'cash'
  rows: DreOutRow[]
  foraDoDre: { values: number[]; categorias: CategoriaLine[] }
  chart: { receita: number[]; gastos: number[]; resultado: number[] }
}

export type CaixaResponse = {
  meses: { mes: string; entradas: number; saidas: number; previsto: boolean }[]
  semanas: { weeks: WeekRow[]; minIndex: number }
  saidasPorCategoria: { nome: string; valor: number }[]
  contas: { id: string; nome: string; banco: string | null; tipo: string | null; saldo: number | null; serie: number[] }[]
  contasSemSaldo: { nome: string; banco: string | null; ativo: boolean }[]
  saldoTotal: number | null
}

export type TitulosResponse = {
  tipo: TipoTitulo
  filtro: string
  rows: TituloRow[]
  counts: Record<string, number>
  aging: number[]
  aberto: number
  vencido: number
  inadimplencia: number | null
  inadimplenciaSerie: { mes: string; taxa: number }[]
}

export type TituloDetalhe = TituloRow & {
  data_competencia: string | null
  conta: string | null
  origem: string | null
  baixas: { id: string; data_pagamento: string; valor_liquido: number; juros: number; multa: number; desconto: number; metodo: string | null; conta: string | null }[]
  rateio: { categoria: string | null; centro_custo: string | null; valor: number }[]
}

export type ClienteCrmRow = {
  doc: string
  nome: string
  vendedor: string | null
  servico: string | null
  fechamento: string | null
  vendido: number
  faturado: number
  recebido: number
  aberto: number
  vencido: number
  status: CrmStatus
}

export type ClientesResponse = {
  rows: ClienteCrmRow[]
  counts: Record<CrmStatus, number>
  porVendedor: { vendedor: string; recebido: number }[]
}
