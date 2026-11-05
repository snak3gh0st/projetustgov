import type { Overview, ResultadoMes, TituloRow } from '@/lib/financeiro/types'

/** Sábado a sexta, datas de São Paulo (YYYY-MM-DD). */
export type Semana = { de: string; ate: string }

export type Alerta = { nivel: 'critico' | 'aviso'; titulo: string; detalhe: string }

export type Movimento = { data: string; pessoa: string; descricao: string | null; valor: number }

export type Venda = {
  data: string
  cliente: string
  local: string | null
  servico: string
  valor: number
  vendedor: string
}

export type AtividadeVendedor = { nome: string; trabalhados: number; avancos: number; perdas: number; vendas: number; valorVendido: number }

export type Relatorio = {
  versao: 1
  semana: Semana
  proxima: Semana
  geradoEm: string
  /** Fim da última sincronização do Conta Azul usada nos números financeiros. */
  financeiroAte: string | null
  alertas: Alerta[]
  financeiro: {
    saldo: { total: number | null; inicioSemana: number | null; contasNegativas: number }
    porEmpresa: { empresa: string; saldo: number; variacao: number }[]
    semana: { recebido: number; pago: number; recebimentos: Movimento[]; pagamentos: Movimento[] }
    agenda: { dias: { data: string; receber: number; pagar: number }[]; titulos: TituloRow[] }
    atrasados: {
      receber: { total: number; count: number; top: { nome: string; valor: number; desde: string | null }[] }
      pagar: { total: number; count: number; nomes: string[] }
    }
    resultado: { mtd: { atual: number; anterior: number }; mes: ResultadoMes | null; mesAnterior: ResultadoMes | null }
    porNegocio: { negocio: string; receita: number }[]
    posicao: Overview['posicao']
    /** Menor saldo projetado nos próximos 30 dias. */
    projecaoMin: { data: string; saldo: number } | null
  }
  comercial: {
    vendas: { itens: Venda[]; total: number; mes: { count: number; total: number }; serie: { semana: string; count: number; total: number }[] }
    time: AtividadeVendedor[]
    funil: { status: string; leads: number; anterior: number | null }[]
    movimento: { etapa: string; leads: number }[]
    distribuidos: number
    carteira: { clientes: number; vendido: number; faturado: number; recebido: number; aberto: number; vencido: number }
  }
}
