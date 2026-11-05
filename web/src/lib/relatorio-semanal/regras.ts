import { addDaysISO, daysBetween } from '../conta-azul/finance/dates'
import type { Alerta, Relatorio, Semana } from './types'

/** Semana de sábado a sexta que contém `hoje` (data de São Paulo). */
export function semanaDe(hoje: string): Semana {
  const [y, m, d] = hoje.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const de = addDaysISO(hoje, -((dow + 1) % 7))
  return { de, ate: addDaysISO(de, 6) }
}

/**
 * Última semana já encerrada (a de sexta às 18h em diante). Antes disso, a anterior:
 * um envio forçado ou atrasado (servidor fora do ar na sexta) nunca grava semana pela metade.
 */
export function ultimaSemanaFechada(hoje: string, horaSP: number): Semana {
  const atual = semanaDe(hoje)
  if (hoje === atual.ate && horaSP >= 18) return atual
  return { de: addDaysISO(atual.de, -7), ate: addDaysISO(atual.ate, -7) }
}

export function semanaSeguinte(s: Semana): Semana {
  return { de: addDaysISO(s.de, 7), ate: addDaysISO(s.ate, 7) }
}

export function diasDa(s: Semana): string[] {
  return Array.from({ length: daysBetween(s.de, s.ate) + 1 }, (_, i) => addDaysISO(s.de, i))
}

/**
 * Empresa do grupo pelo nome da conta bancária no Conta Azul
 * ("ITAU - TSCO", "CORA - TALENT HUB", "APLICAÇÃO CAIXA - PROJETUS").
 */
export function empresaDaConta(nome: string): string {
  const n = nome.toUpperCase()
  if (n.includes('PROJETUS')) return 'PROJETUS'
  if (n.includes('TS&CO') || n.includes('TSCO')) return 'TS&CO'
  if (n.includes('ATOM')) return 'ATOM'
  if (n.includes('TALENT')) return 'TALENT HUB'
  if (n.includes('ACADEMIA DO EMPREENDEDOR')) return 'ACADEMIA DO EMPREENDEDOR PÚBLICO'
  if (n.includes('ACADEMIA EMPREENDEDORA')) return 'ACADEMIA EMPREENDEDORA'
  if (n.startsWith('PAD')) return 'PAD'
  return 'Outras'
}

/**
 * Centro de custo normalizado: tira o código numérico ("005 - BATE PAPO - MG")
 * e junta as grafias do mesmo negócio. As duas Academias ficam separadas, como as contas bancárias.
 */
export function negocioDoCentro(nome: string | null): string {
  if (!nome || !nome.trim()) return 'Sem centro de custo'
  const n = nome.replace(/^\s*\d+\s*-\s*/, '').trim().toUpperCase()
  if (n === 'PROJETUS') return 'PROJETUS'
  if (n === 'TALENT' || n === 'TALENTHUB' || n === 'TALENT HUB') return 'TALENT HUB'
  if (n.startsWith('TSCO') || n.startsWith('TS&CO')) return 'TS&CO / EMPREENDEDOR PÚBLICO'
  if (n === 'ACADEMIA EMPREENDEDOR') return 'ACADEMIA DO EMPREENDEDOR PÚBLICO'
  if (n.startsWith('BATE PAPO') && /\b20\d\d\b/.test(n)) return 'BATE PAPO 2025'
  return n
}

const NIVEL = { critico: 0, aviso: 1 } as const

/** Pontos de atenção do topo do relatório. Só regras simples sobre os números já montados. */
export function montarAlertas(r: Omit<Relatorio, 'alertas'>, moeda: (v: number) => string): Alerta[] {
  const out: Alerta[] = []
  const f = r.financeiro
  const c = r.comercial

  if (f.projecaoMin && f.projecaoMin.saldo < 0 && (f.saldo.total ?? 0) > f.projecaoMin.saldo) {
    out.push({
      nivel: 'critico',
      titulo: 'Caixa projetado cai nos próximos 30 dias',
      detalhe: `Com os títulos em aberto, o saldo consolidado chega a ${moeda(f.projecaoMin.saldo)} em ${br(f.projecaoMin.data)}.`,
    })
  }
  if (f.atrasados.receber.total > 0) {
    const maior = f.atrasados.receber.top[0]
    out.push({
      nivel: 'aviso',
      titulo: `${moeda(f.atrasados.receber.total)} a receber vencidos`,
      detalhe: `${f.atrasados.receber.count} título${f.atrasados.receber.count === 1 ? '' : 's'}${maior ? `. O maior é de ${maior.nome} (${moeda(maior.valor)}).` : '.'}`,
    })
  }
  if (f.atrasados.pagar.count > 0) {
    out.push({
      nivel: 'aviso',
      titulo: `${f.atrasados.pagar.count} conta${f.atrasados.pagar.count === 1 ? '' : 's'} a pagar em atraso`,
      detalhe: `Total de ${moeda(f.atrasados.pagar.total)}: ${f.atrasados.pagar.nomes.join(', ')}.`,
    })
  }
  const { atual, anterior } = f.resultado.mtd
  if (anterior > 0 && atual < anterior * 0.8) {
    out.push({
      nivel: 'aviso',
      titulo: 'Faturamento do mês abaixo do mês passado',
      detalhe: `${moeda(atual)} até agora, contra ${moeda(anterior)} no mesmo ponto do mês anterior (${Math.round((1 - atual / anterior) * 100)}% a menos).`,
    })
  }
  if (c.vendas.itens.length === 0) {
    out.push({ nivel: 'aviso', titulo: 'Nenhuma venda fechada na semana', detalhe: `Vendas no mês: ${c.vendas.mes.count} (${moeda(c.vendas.mes.total)}).` })
  }
  const parados = c.time.filter((v) => v.trabalhados === 0).map((v) => v.nome)
  if (parados.length) {
    out.push({ nivel: 'aviso', titulo: 'Vendedor sem atividade no CRM', detalhe: `${parados.join(', ')} não movimentou nenhum lead na semana.` })
  }
  return out.sort((a, b) => NIVEL[a.nivel] - NIVEL[b.nivel])
}

function br(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
