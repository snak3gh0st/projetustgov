import 'server-only'
import { query } from '@/lib/db'
import { addDaysISO, agingBucket, monthKey, todaySP } from '../conta-azul/finance/dates'
import type { DreLinha } from '../conta-azul/finance/dre'
import {
  addMonths,
  buildDre,
  classifyCrm,
  closedMonths,
  dailyProjection,
  nonPaymentRate,
  parcelStatus,
  weeklyProjection,
  type CategoriaInfo,
  type CategoriaValue,
  type CrmStatus,
  type Flow,
  type PeriodKey,
} from './assemble'
import type {
  CaixaResponse,
  ClienteCrmRow,
  ClientesResponse,
  Overview,
  ResultadoMes,
  ResultadoResponse,
  TipoTitulo,
  TituloDetalhe,
  TituloRow,
  TitulosResponse,
} from './types'

/**
 * Read-only queries for the BI Financeiro. Everything comes from the local
 * Conta Azul mirror; nothing here calls the Conta Azul API.
 */

/** Open title: still owed and not written off, renegotiated or cancelled. */
const OPEN = `p.deleted_at IS NULL AND p.nao_pago > 0 AND COALESCE(p.status_busca, '') NOT IN ('PERDIDO', 'RENEGOCIADO', 'CANCELADO')`

/** Evento still alive in Conta Azul (at least one parcela not removed or cancelled). */
const LIVE_EVENTO = `EXISTS (
  SELECT 1 FROM conta_azul_parcelas lp
  WHERE lp.evento_id = r.evento_id AND lp.deleted_at IS NULL AND COALESCE(lp.status, '') <> 'CANCELADO'
)`

const NOT_TRANSFER = `COALESCE(r.origem, '') <> 'TRANSFERENCIA'`

function monthStart(m: string) {
  return `${m}-01`
}

/* ------------------------------------------------------------ DRE inputs */

type DreInputs = { lines: DreLinha[]; pairs: { dre_linha_id: string; categoria_id: string }[]; cats: CategoriaInfo[] }

async function dreInputs(): Promise<DreInputs> {
  const [lines, pairs, cats] = await Promise.all([
    query<DreLinha>(
      `SELECT id, parent_id, codigo, descricao, posicao, nivel, ordem, totalizador FROM conta_azul_dre_linhas ORDER BY ordem`
    ),
    query<{ dre_linha_id: string; categoria_id: string }>(`SELECT dre_linha_id, categoria_id FROM conta_azul_dre_categorias`),
    query<CategoriaInfo>(`SELECT id, nome, categoria_pai, entrada_dre FROM conta_azul_categorias`),
  ])
  return { lines, pairs, cats }
}

/** Signed per-category values by month index: competência from the rateio, caixa from baixas split by rateio share. */
async function categoryValues(months: string[], regime: 'comp' | 'cash', cc: string | null): Promise<CategoriaValue[]> {
  const from = monthStart(months[0])
  const to = monthStart(addMonths(months[months.length - 1], 1))
  const rows =
    regime === 'comp'
      ? await query<{ categoria_id: string | null; m: string; v: number }>(
          `SELECT r.categoria_id, to_char(r.data_competencia, 'YYYY-MM') AS m,
                  SUM(CASE WHEN r.tipo = 'RECEITA' THEN r.valor ELSE -r.valor END)::float8 AS v
           FROM conta_azul_rateio r
           WHERE r.data_competencia >= $1::date AND r.data_competencia < $2::date
             AND ($3::text IS NULL OR r.centro_custo_id = $3)
             AND ${NOT_TRANSFER} AND ${LIVE_EVENTO}
           GROUP BY 1, 2`,
          [from, to, cc]
        )
      : await query<{ categoria_id: string | null; m: string; v: number }>(
          `WITH t AS (SELECT evento_id, SUM(valor) AS total FROM conta_azul_rateio GROUP BY evento_id)
           SELECT r.categoria_id, to_char(b.data_pagamento, 'YYYY-MM') AS m,
                  SUM(b.valor_liquido
                      * CASE WHEN r.evento_id IS NULL THEN 1 ELSE r.valor / NULLIF(t.total, 0) END
                      * CASE WHEN b.tipo = 'RECEITA' THEN 1 ELSE -1 END)::float8 AS v
           FROM conta_azul_baixas b
           JOIN conta_azul_parcelas p ON p.id = b.parcela_id AND p.deleted_at IS NULL
           LEFT JOIN conta_azul_rateio r ON r.evento_id = b.evento_id
           LEFT JOIN t ON t.evento_id = b.evento_id
           WHERE b.data_pagamento >= $1::date AND b.data_pagamento < $2::date
             AND ($3::text IS NULL OR r.centro_custo_id = $3)
             AND COALESCE(p.origem, '') <> 'TRANSFERENCIA'
           GROUP BY 1, 2`,
          [from, to, cc]
        )
  const idx = new Map(months.map((m, i) => [m, i]))
  return rows
    .filter((r) => idx.has(r.m))
    .map((r) => ({ categoria_id: r.categoria_id, idx: idx.get(r.m)!, valor: Number(r.v) }))
}

export async function getResultado(opts: { period: PeriodKey; regime: 'comp' | 'cash'; cc: string | null }): Promise<ResultadoResponse> {
  const months = closedMonths(opts.period, todaySP())
  const [inputs, values] = await Promise.all([dreInputs(), categoryValues(months, opts.regime, opts.cc)])
  const dre = buildDre(inputs.lines, inputs.pairs, inputs.cats, values, months.length)
  const top = dre.rows.filter((r) => r.parent_id === null)
  const group = (code: string) => top.find((r) => r.codigo === code)?.values ?? months.map(() => 0)
  const receita = group('01')
  const finalTotal = [...top].reverse().find((r) => r.totalizador)?.values ?? months.map(() => 0)
  const gastos = months.map((_, i) => Math.round((receita[i] - finalTotal[i]) * 100) / 100)
  return { months, regime: opts.regime, rows: dre.rows, foraDoDre: dre.unclassified, chart: { receita, gastos, resultado: finalTotal } }
}

/* --------------------------------------------------------------- shared */

async function latestBalances() {
  return query<{ id: string; nome: string; banco: string | null; tipo: string | null; ativo: boolean; saldo: number | null; data: string | null }>(
    `SELECT c.id, c.nome, c.banco, c.tipo, c.ativo, s.saldo::float8 AS saldo, s.data::text AS data
     FROM conta_azul_contas_financeiras c
     LEFT JOIN LATERAL (
       SELECT saldo, data FROM conta_azul_saldos_diarios WHERE conta_financeira_id = c.id ORDER BY data DESC LIMIT 1
     ) s ON TRUE
     ORDER BY s.saldo DESC NULLS LAST, c.nome`
  )
}

async function openFlows(today: string): Promise<Flow[]> {
  const rows = await query<{ d: string; v: number }>(
    `SELECT p.data_vencimento::text AS d,
            SUM(CASE WHEN p.tipo = 'RECEITA' THEN p.nao_pago ELSE -p.nao_pago END)::float8 AS v
     FROM conta_azul_parcelas p
     WHERE ${OPEN} AND p.data_vencimento >= $1::date
     GROUP BY 1`,
    [today]
  )
  return rows.map((r) => ({ date: r.d, net: Number(r.v) }))
}

type TituloSql = {
  id: string
  tipo: TipoTitulo
  data_vencimento: string | null
  pessoa_nome: string | null
  descricao: string | null
  categoria: string | null
  valor_total: number
  valor_pago: number
  nao_pago: number
}

const TITULO_COLS = `p.id, p.tipo, p.data_vencimento::text AS data_vencimento, p.pessoa_nome, p.descricao,
  p.busca_payload->'categorias'->0->>'nome' AS categoria,
  p.valor_total::float8 AS valor_total, p.valor_pago::float8 AS valor_pago, p.nao_pago::float8 AS nao_pago`

function toTitulo(r: TituloSql, today: string): TituloRow {
  return { ...r, status: parcelStatus(r, today) }
}

async function agingFor(tipo: TipoTitulo, today: string): Promise<number[]> {
  const rows = await query<{ d: string; v: number }>(
    `SELECT p.data_vencimento::text AS d, SUM(p.nao_pago)::float8 AS v
     FROM conta_azul_parcelas p
     WHERE ${OPEN} AND p.tipo = $1 AND p.data_vencimento IS NOT NULL
     GROUP BY 1`,
    [tipo]
  )
  const out = [0, 0, 0, 0, 0]
  for (const r of rows) out[agingBucket(r.d, today)] += Number(r.v)
  return out.map((v) => Math.round(v * 100) / 100)
}

/** Unpaid share of receivables that came due, per due month and over the last 12 months. */
async function nonPayment(today: string) {
  const months = closedMonths('12', today)
  const rows = await query<{ m: string; valor_total: number; nao_pago: number }>(
    `SELECT to_char(p.data_vencimento, 'YYYY-MM') AS m,
            SUM(p.valor_total)::float8 AS valor_total,
            SUM(CASE WHEN p.status_busca = 'PERDIDO' THEN p.valor_total - p.valor_pago ELSE p.nao_pago END)::float8 AS nao_pago
     FROM conta_azul_parcelas p
     WHERE p.deleted_at IS NULL AND p.tipo = 'RECEITA'
       AND p.data_vencimento >= $1::date AND p.data_vencimento < $2::date
     GROUP BY 1`,
    [monthStart(months[0]), today]
  )
  const byMonth = new Map(rows.map((r) => [r.m, { valor_total: Number(r.valor_total), nao_pago: Number(r.nao_pago) }]))
  return {
    taxa: nonPaymentRate(Array.from(byMonth.values())),
    serie: months.map((m) => ({ mes: m, taxa: nonPaymentRate(byMonth.has(m) ? [byMonth.get(m)!] : []) })),
  }
}

/* ------------------------------------------------------------- overview */

function businessDays(fromISO: string, toISO: string): number {
  let n = 0
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6) n += 1
  }
  return n
}

function resultadoMes(rows: ResultadoResponse['rows'], idx: number, mes: string): ResultadoMes {
  const top = rows.filter((r) => r.parent_id === null)
  const g = (code: string) => top.find((r) => r.codigo === code)?.values[idx] ?? 0
  const resultado = [...top].reverse().find((r) => r.totalizador)?.values[idx] ?? 0
  const faturamento = g('01')
  const deducoes = g('02')
  const custos = g('03')
  const despesas = g('04')
  const outros = Math.round((resultado - faturamento - deducoes - custos - despesas) * 100) / 100
  return { mes, faturamento, deducoes, custos, despesas, outros, resultado }
}

export async function getOverview(): Promise<Overview> {
  const today = todaySP()
  const lastClosed = addMonths(monthKey(today), -1)
  const months = [addMonths(lastClosed, -1), lastClosed]
  const curMonth = monthKey(today)
  const dayOfMonth = Number(today.slice(8, 10))
  const prevSamePoint = `${addMonths(curMonth, -1)}-${String(Math.min(dayOfMonth, 28)).padStart(2, '0')}`

  const [balances, serie30, flows, proximos, atrasados, inputs, values, mtd, agingR, np, payOpen, loansRows] = await Promise.all([
    latestBalances(),
    query<{ date: string; balance: number }>(
      `SELECT data::text AS date, SUM(saldo)::float8 AS balance
       FROM conta_azul_saldos_diarios s
       JOIN conta_azul_contas_financeiras c ON c.id = s.conta_financeira_id AND c.ativo
       WHERE data >= $1::date GROUP BY data ORDER BY data`,
      [addDaysISO(today, -30)]
    ),
    openFlows(today),
    query<TituloSql>(
      `SELECT ${TITULO_COLS} FROM conta_azul_parcelas p
       WHERE ${OPEN} AND p.data_vencimento BETWEEN $1::date AND $2::date
       ORDER BY p.data_vencimento, p.nao_pago DESC`,
      [today, addDaysISO(today, 6)]
    ),
    query<TituloSql>(
      `SELECT ${TITULO_COLS} FROM conta_azul_parcelas p
       WHERE ${OPEN} AND p.tipo = 'RECEITA' AND p.data_vencimento < $1::date
       ORDER BY p.nao_pago DESC`,
      [today]
    ),
    dreInputs(),
    categoryValues(months, 'comp', null),
    query<{ atual: number; anterior: number }>(
      `SELECT COALESCE(SUM(r.valor) FILTER (WHERE r.data_competencia BETWEEN $1::date AND $2::date), 0)::float8 AS atual,
              COALESCE(SUM(r.valor) FILTER (WHERE r.data_competencia BETWEEN $3::date AND $4::date), 0)::float8 AS anterior
       FROM conta_azul_rateio r
       WHERE r.tipo = 'RECEITA' AND ${NOT_TRANSFER} AND ${LIVE_EVENTO}
         AND r.categoria_id IN (
           SELECT dc.categoria_id FROM conta_azul_dre_categorias dc
           JOIN conta_azul_dre_linhas l ON l.id = dc.dre_linha_id
           WHERE l.codigo LIKE '01%'
         )`,
      [monthStart(curMonth), today, monthStart(addMonths(curMonth, -1)), prevSamePoint]
    ),
    agingFor('RECEITA', today),
    nonPayment(today),
    query<{ d: string; v: number; pessoa_nome: string | null }>(
      `SELECT p.data_vencimento::text AS d, p.nao_pago::float8 AS v, p.pessoa_nome
       FROM conta_azul_parcelas p WHERE ${OPEN} AND p.tipo = 'DESPESA'`
    ),
    query<{ categoria_id: string | null; v: number }>(
      `WITH t AS (SELECT evento_id, SUM(valor) AS total FROM conta_azul_rateio GROUP BY evento_id)
       SELECT r.categoria_id, SUM(p.nao_pago * r.valor / NULLIF(t.total, 0))::float8 AS v
       FROM conta_azul_parcelas p
       JOIN conta_azul_rateio r ON r.evento_id = p.evento_id
       JOIN t ON t.evento_id = p.evento_id
       WHERE ${OPEN} AND p.tipo = 'DESPESA'
       GROUP BY 1`
    ),
  ])

  const active = balances.filter((b) => b.ativo && b.saldo !== null)
  const saldoTotal = active.length ? Math.round(active.reduce((a, b) => a + Number(b.saldo), 0) * 100) / 100 : null
  const saldoData = active.reduce<string | null>((a, b) => (b.data && (!a || b.data > a) ? b.data : a), null)
  const first = serie30[0]
  const variacao30 = saldoTotal !== null && first && first.date < today ? Math.round((saldoTotal - Number(first.balance)) * 100) / 100 : null

  const dre = buildDre(inputs.lines, inputs.pairs, inputs.cats, values, 2)

  // payables: overdue go to the first week, then 4 weeks from today
  const semanas = Array.from({ length: 4 }, (_, i) => ({ from: addDaysISO(today, i * 7), to: addDaysISO(today, i * 7 + 6), valor: 0 }))
  const payLate: { v: number; nome: string | null }[] = []
  let pagarTotal = 0
  for (const r of payOpen) {
    const v = Number(r.v)
    pagarTotal += v
    if (r.d < today) {
      payLate.push({ v, nome: r.pessoa_nome })
      semanas[0].valor += v
      continue
    }
    const idx = Math.floor((new Date(`${r.d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / (7 * 86_400_000))
    if (idx < 4) semanas[idx].valor += v
  }

  // loans: open payables whose category sits on the "Empréstimos e Dívidas" line (07.2)
  const loanLine = inputs.lines.find((l) => l.codigo === '07.2')?.id
  let emprestimos = 0
  if (loanLine) {
    const loanDre = buildDre(inputs.lines, inputs.pairs, inputs.cats, loansRows.map((r) => ({ categoria_id: r.categoria_id, idx: 0, valor: Number(r.v) })), 1)
    emprestimos = loanDre.rows.find((r) => r.id === loanLine)?.values[0] ?? 0
  }

  const aberto = agingR.reduce((a, b) => a + b, 0)
  const vencido = agingR[1] + agingR[2] + agingR[3] + agingR[4]
  const saldoBase = saldoTotal ?? 0
  const pagarSemEmprestimos = Math.max(0, pagarTotal - emprestimos)

  return {
    today,
    saldo: { total: saldoTotal, contas: active.length, negativas: active.filter((b) => Number(b.saldo) < 0).length, data: saldoData, variacao30, desde: serie30[0]?.date ?? null },
    saldoSerie: serie30.map((s) => ({ date: s.date, balance: Number(s.balance) })),
    projecao: dailyProjection(saldoBase, flows, today, 60),
    proximos7: proximos.map((r) => toTitulo(r, today)),
    atrasados: {
      total: Math.round(atrasados.reduce((a, r) => a + Number(r.nao_pago), 0) * 100) / 100,
      count: atrasados.length,
      top: atrasados.slice(0, 3).map((r) => toTitulo(r, today)),
    },
    resultado: {
      atual: resultadoMes(dre.rows, 1, months[1]),
      anterior: resultadoMes(dre.rows, 0, months[0]),
      foraDoDre: dre.unclassified.values[1] ?? 0,
      mtd: { atual: Number(mtd[0]?.atual ?? 0), mesmoPontoAnterior: Number(mtd[0]?.anterior ?? 0), diasUteis: businessDays(monthStart(curMonth), today) },
    },
    receber: { aging: agingR, aberto, vencido, inadimplencia: np.taxa, inadimplenciaSerie: np.serie },
    pagar: {
      semanas: semanas.map((s) => ({ ...s, valor: Math.round(s.valor * 100) / 100 })),
      atrasados: { count: payLate.length, total: Math.round(payLate.reduce((a, x) => a + x.v, 0) * 100) / 100, nomes: Array.from(new Set(payLate.map((x) => x.nome ?? 'Sem fornecedor'))).slice(0, 4) },
    },
    posicao: {
      saldo: saldoBase,
      receber: aberto,
      pagar: Math.round(pagarSemEmprestimos * 100) / 100,
      emprestimos: Math.round(emprestimos * 100) / 100,
      liquida: Math.round((saldoBase + aberto - pagarTotal) * 100) / 100,
    },
  }
}

/* ---------------------------------------------------------------- caixa */

export async function getCaixa(opts: { period: PeriodKey; cc: string | null }): Promise<CaixaResponse> {
  const today = todaySP()
  const months = closedMonths(opts.period, today)
  const from = monthStart(months[0])
  const to = monthStart(addMonths(months[months.length - 1], 1))

  const [realized, flows, balances, sparks, outCats, inputs] = await Promise.all([
    query<{ m: string; entradas: number; saidas: number }>(
      opts.cc
        ? `WITH t AS (SELECT evento_id, SUM(valor) AS total FROM conta_azul_rateio GROUP BY evento_id)
           SELECT to_char(b.data_pagamento, 'YYYY-MM') AS m,
                  SUM(b.valor_liquido * r.valor / NULLIF(t.total, 0)) FILTER (WHERE b.tipo = 'RECEITA')::float8 AS entradas,
                  SUM(b.valor_liquido * r.valor / NULLIF(t.total, 0)) FILTER (WHERE b.tipo = 'DESPESA')::float8 AS saidas
           FROM conta_azul_baixas b
           JOIN conta_azul_parcelas p ON p.id = b.parcela_id AND p.deleted_at IS NULL
           JOIN conta_azul_rateio r ON r.evento_id = b.evento_id AND r.centro_custo_id = $3
           JOIN t ON t.evento_id = b.evento_id
           WHERE b.data_pagamento >= $1::date AND b.data_pagamento < $2::date AND COALESCE(p.origem, '') <> 'TRANSFERENCIA'
           GROUP BY 1`
        : `SELECT to_char(b.data_pagamento, 'YYYY-MM') AS m,
                  SUM(b.valor_liquido) FILTER (WHERE b.tipo = 'RECEITA')::float8 AS entradas,
                  SUM(b.valor_liquido) FILTER (WHERE b.tipo = 'DESPESA')::float8 AS saidas
           FROM conta_azul_baixas b
           JOIN conta_azul_parcelas p ON p.id = b.parcela_id AND p.deleted_at IS NULL
           WHERE b.data_pagamento >= $1::date AND b.data_pagamento < $2::date AND COALESCE(p.origem, '') <> 'TRANSFERENCIA'
           GROUP BY 1`,
      opts.cc ? [from, to, opts.cc] : [from, to]
    ),
    openFlows(today),
    latestBalances(),
    query<{ id: string; data: string; saldo: number }>(
      `SELECT conta_financeira_id AS id, data::text AS data, saldo::float8 AS saldo
       FROM conta_azul_saldos_diarios WHERE data >= $1::date ORDER BY data`,
      [addDaysISO(today, -30)]
    ),
    categoryValues(months, 'cash', opts.cc),
    dreInputs(),
  ])

  const byMonth = new Map(realized.map((r) => [r.m, r]))
  const meses: CaixaResponse['meses'] = months.map((m) => ({
    mes: m,
    entradas: Math.round(Number(byMonth.get(m)?.entradas ?? 0) * 100) / 100,
    saidas: Math.round(Number(byMonth.get(m)?.saidas ?? 0) * 100) / 100,
    previsto: false,
  }))
  // next three months (current included) from open titles due from today on
  for (let k = 0; k < 3; k++) {
    const m = addMonths(monthKey(today), k)
    let entradas = 0
    let saidas = 0
    for (const f of flows) {
      if (monthKey(f.date) !== m) continue
      if (f.net >= 0) entradas += f.net
      else saidas += -f.net
    }
    meses.push({ mes: m, entradas: Math.round(entradas * 100) / 100, saidas: Math.round(saidas * 100) / 100, previsto: true })
  }

  const saldoAtivo = balances.filter((b) => b.ativo && b.saldo !== null)
  const saldoTotal = saldoAtivo.length ? saldoAtivo.reduce((a, b) => a + Number(b.saldo), 0) : null

  const names = new Map(inputs.cats.map((c) => [c.id, c.nome]))
  const outTotals = new Map<string, number>()
  for (const v of outCats) {
    if (v.valor >= 0) continue
    const nome = v.categoria_id ? names.get(v.categoria_id) ?? 'Categoria removida' : 'Sem categoria'
    outTotals.set(nome, (outTotals.get(nome) ?? 0) - v.valor)
  }
  const sorted = Array.from(outTotals.entries()).sort((a, b) => b[1] - a[1])
  const saidasPorCategoria = sorted.slice(0, 7).map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
  const rest = sorted.slice(7).reduce((a, [, v]) => a + v, 0)
  if (rest > 0) saidasPorCategoria.push({ nome: `Outras ${sorted.length - 7} categorias`, valor: Math.round(rest * 100) / 100 })

  const sparkBy = new Map<string, number[]>()
  for (const s of sparks) sparkBy.set(s.id, [...(sparkBy.get(s.id) ?? []), Number(s.saldo)])

  return {
    meses,
    semanas: weeklyProjection(saldoTotal ?? 0, flows, today, 13),
    saidasPorCategoria,
    contas: saldoAtivo
      .filter((b) => Math.abs(Number(b.saldo)) >= 0.01)
      .map((b) => ({ id: b.id, nome: b.nome, banco: b.banco, tipo: b.tipo, saldo: Number(b.saldo), serie: sparkBy.get(b.id) ?? [] })),
    contasSemSaldo: balances
      .filter((b) => !b.ativo || b.saldo === null || Math.abs(Number(b.saldo)) < 0.01)
      .map((b) => ({ nome: b.nome, banco: b.banco, ativo: b.ativo })),
    saldoTotal: saldoTotal === null ? null : Math.round(saldoTotal * 100) / 100,
  }
}

/* -------------------------------------------------------------- títulos */

const FILTERS: Record<string, string> = {
  vencido: `${OPEN} AND p.data_vencimento < $2::date`,
  hoje: `${OPEN} AND p.data_vencimento = $2::date`,
  '7': `${OPEN} AND p.data_vencimento BETWEEN $2::date AND ($2::date + 7)`,
  '30': `${OPEN} AND p.data_vencimento BETWEEN $2::date AND ($2::date + 30)`,
  pago: `p.deleted_at IS NULL AND p.nao_pago <= 0 AND COALESCE(p.status_busca, '') <> 'PERDIDO'`,
  all: `p.deleted_at IS NULL`,
}

export async function getTitulos(opts: { tipo: TipoTitulo; filtro: string }): Promise<TitulosResponse> {
  const today = todaySP()
  const filtro = FILTERS[opts.filtro] ? opts.filtro : 'vencido'
  const order = filtro === 'pago' || filtro === 'all' ? 'p.data_vencimento DESC NULLS LAST' : 'p.data_vencimento ASC, p.nao_pago DESC'
  const countExpr = Object.entries(FILTERS)
    .map(([k, cond]) => `COUNT(*) FILTER (WHERE ${cond})::int AS "${k}"`)
    .join(', ')

  const [rows, counts, aging, np] = await Promise.all([
    query<TituloSql>(
      `SELECT ${TITULO_COLS} FROM conta_azul_parcelas p
       WHERE p.tipo = $1 AND ${FILTERS[filtro]}
       ORDER BY ${order} LIMIT 1000`,
      [opts.tipo, today]
    ),
    query<Record<string, number>>(`SELECT ${countExpr} FROM conta_azul_parcelas p WHERE p.tipo = $1`, [opts.tipo, today]),
    agingFor(opts.tipo, today),
    opts.tipo === 'RECEITA' ? nonPayment(today) : Promise.resolve(null),
  ])

  return {
    tipo: opts.tipo,
    filtro,
    rows: rows.map((r) => toTitulo(r, today)),
    counts: counts[0] ?? {},
    aging,
    aberto: aging.reduce((a, b) => a + b, 0),
    vencido: aging[1] + aging[2] + aging[3] + aging[4],
    inadimplencia: np?.taxa ?? null,
    inadimplenciaSerie: np?.serie ?? [],
  }
}

export async function getTitulo(id: string): Promise<TituloDetalhe | null> {
  const today = todaySP()
  const rows = await query<TituloSql & { data_competencia: string | null; conta: string | null; origem: string | null; evento_id: string | null }>(
    `SELECT ${TITULO_COLS}, p.data_competencia::text AS data_competencia, c.nome AS conta, p.origem, p.evento_id
     FROM conta_azul_parcelas p
     LEFT JOIN conta_azul_contas_financeiras c ON c.id = p.conta_financeira_id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  )
  const p = rows[0]
  if (!p) return null
  const [baixas, rateio] = await Promise.all([
    query<TituloDetalhe['baixas'][number]>(
      `SELECT b.id, b.data_pagamento::text AS data_pagamento, b.valor_liquido::float8 AS valor_liquido, b.juros::float8 AS juros,
              b.multa::float8 AS multa, b.desconto::float8 AS desconto, b.metodo_pagamento AS metodo, c.nome AS conta
       FROM conta_azul_baixas b LEFT JOIN conta_azul_contas_financeiras c ON c.id = b.conta_financeira_id
       WHERE b.parcela_id = $1 ORDER BY b.data_pagamento`,
      [id]
    ),
    p.evento_id
      ? query<TituloDetalhe['rateio'][number]>(
          `SELECT COALESCE(cat.nome, r.categoria_nome) AS categoria, cc.nome AS centro_custo, r.valor::float8 AS valor
           FROM conta_azul_rateio r
           LEFT JOIN conta_azul_categorias cat ON cat.id = r.categoria_id
           LEFT JOIN conta_azul_centros_custo cc ON cc.id = r.centro_custo_id
           WHERE r.evento_id = $1 ORDER BY r.linha`,
          [p.evento_id]
        )
      : Promise.resolve([]),
  ])
  const { evento_id: _evento, ...rest } = p
  void _evento
  return { ...toTitulo(rest, today), data_competencia: p.data_competencia, conta: p.conta, origem: p.origem, baixas, rateio }
}

/* --------------------------------------------------------- clientes × CRM */

export async function getClientesCrm(): Promise<ClientesResponse> {
  const today = todaySP()
  const rows = await query<{
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
  }>(
    `WITH ca AS (
       SELECT pe.documento_digits AS doc, MAX(pe.nome) AS nome,
              SUM(p.valor_total) AS faturado, SUM(p.valor_pago) AS recebido,
              SUM(p.nao_pago) FILTER (WHERE ${OPEN}) AS aberto,
              SUM(p.nao_pago) FILTER (WHERE ${OPEN} AND p.data_vencimento < $1::date) AS vencido
       FROM conta_azul_parcelas p
       JOIN conta_azul_pessoas pe ON pe.id = p.pessoa_id
       WHERE p.tipo = 'RECEITA' AND p.deleted_at IS NULL AND pe.documento_digits IS NOT NULL AND pe.documento_digits <> ''
       GROUP BY pe.documento_digits
     ), crm AS (
       SELECT regexp_replace(vp.cnpj, '\\D', '', 'g') AS doc, MAX(vp.nome) AS nome,
              SUM(COALESCE(vp.valor_venda, 0)) AS vendido, MAX(vp.fechamento_at) AS fechamento,
              string_agg(DISTINCT u.nome, ', ') AS vendedor,
              string_agg(DISTINCT NULLIF(vp.tipo_servico, ''), ', ') AS servico
       FROM vendedor_projetos vp
       LEFT JOIN users u ON u.id = vp.vendedor_id
       WHERE vp.fechamento_at IS NOT NULL AND vp.cnpj IS NOT NULL
       GROUP BY 1
     )
     SELECT COALESCE(ca.doc, crm.doc) AS doc, COALESCE(ca.nome, crm.nome, COALESCE(ca.doc, crm.doc)) AS nome,
            crm.vendedor, crm.servico, crm.fechamento::date::text AS fechamento,
            COALESCE(crm.vendido, 0)::float8 AS vendido, COALESCE(ca.faturado, 0)::float8 AS faturado,
            COALESCE(ca.recebido, 0)::float8 AS recebido, COALESCE(ca.aberto, 0)::float8 AS aberto,
            COALESCE(ca.vencido, 0)::float8 AS vencido
     FROM ca FULL OUTER JOIN crm ON crm.doc = ca.doc`,
    [today]
  )

  const out: ClienteCrmRow[] = rows.map((r) => ({ ...r, status: classifyCrm({ vendido: Number(r.vendido), faturado: Number(r.faturado) }) }))
  const counts: Record<CrmStatus, number> = { ok: 0, semfat: 0, diverg: 0, semcrm: 0 }
  out.forEach((r) => { counts[r.status] += 1 })
  const bySeller = new Map<string, number>()
  for (const r of out) {
    if (!r.vendedor || r.status === 'semcrm' || r.status === 'semfat') continue
    const v = r.vendedor.split(', ')[0]
    bySeller.set(v, (bySeller.get(v) ?? 0) + Number(r.recebido))
  }
  out.sort((a, b) => Math.max(b.vendido, b.faturado) - Math.max(a.vendido, a.faturado))
  return {
    rows: out,
    counts,
    porVendedor: Array.from(bySeller.entries())
      .map(([vendedor, recebido]) => ({ vendedor, recebido: Math.round(recebido * 100) / 100 }))
      .sort((a, b) => b.recebido - a.recebido),
  }
}
