import type { BaixaRow, BuscaRow, ParcelaDetailRow, RateioRow, StoredMeta, Tipo } from './types'

/**
 * Pure mapping from Conta Azul API v2 payloads to mirror rows.
 * The API is inconsistent between endpoints (itens/items, itens_totais/
 * total_itens/totalItems), so every reader here is defensive.
 */

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {}
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function date10(v: unknown): string | null {
  const s = str(v)
  return s ? s.slice(0, 10) : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function tipoOf(v: unknown): Tipo | null {
  const s = str(v)?.toUpperCase()
  return s === 'RECEITA' || s === 'DESPESA' ? s : null
}

export function listItems(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  const o = obj(body)
  for (const key of ['itens', 'items', 'data', 'content']) {
    if (Array.isArray(o[key])) return o[key] as unknown[]
  }
  return []
}

export function listTotal(body: unknown): number | null {
  const o = obj(body)
  for (const key of ['itens_totais', 'total_itens', 'totalItems', 'total']) {
    if (typeof o[key] === 'number') return o[key] as number
  }
  return null
}

/** Normalises CA timestamps to YYYY-MM-DDTHH:mm:ss so stored and fetched values compare as strings. */
export function normalizeTs(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const t = s.replace(' ', 'T')
  if (t.length === 10) return `${t}T00:00:00`
  return t.slice(0, 19)
}

export function parcelaFromBusca(item: unknown, tipo: Tipo): BuscaRow {
  const o = obj(item)
  const pessoa = obj(o.cliente ?? o.fornecedor)
  return {
    id: String(o.id),
    tipo,
    status_busca: str(o.status_traduzido) ?? str(o.status),
    descricao: str(o.descricao),
    data_vencimento: date10(o.data_vencimento),
    data_competencia: date10(o.data_competencia),
    valor_total: num(o.total),
    valor_pago: num(o.pago),
    nao_pago: num(o.nao_pago),
    pessoa_id: str(pessoa.id),
    pessoa_nome: str(pessoa.nome),
    ca_data_alteracao: normalizeTs(o.data_alteracao),
    busca_payload: item,
  }
}

export function parcelaFromDetail(detail: unknown): ParcelaDetailRow {
  const o = obj(detail)
  const ev = obj(o.evento)
  return {
    id: String(o.id),
    evento_id: str(ev.id),
    tipo: tipoOf(ev.tipo),
    status: str(o.status),
    descricao: str(o.descricao),
    data_vencimento: date10(o.data_vencimento),
    data_competencia: date10(ev.data_competencia),
    data_pagamento_previsto: date10(o.data_pagamento_previsto),
    valor_pago: num(o.valor_pago),
    nao_pago: num(o.nao_pago),
    perda: numOrNull(o.perda),
    conta_financeira_id: str(obj(o.conta_financeira).id) ?? str(o.id_conta_financeira),
    origem: str(obj(ev.referencia).origem),
    conciliado: typeof o.conciliado === 'boolean' ? o.conciliado : null,
    quantidade_parcelas: Math.max(1, num(obj(ev.condicao_pagamento).quantidade_parcelas)),
    detail_alteracao: normalizeTs(o.data_alteracao),
  }
}

export function baixasFromDetail(detail: unknown): BaixaRow[] {
  const o = obj(detail)
  const ev = obj(o.evento)
  const baixas = Array.isArray(o.baixas) ? o.baixas : []
  return baixas
    .map((raw): BaixaRow | null => {
      const b = obj(raw)
      const comp = obj(b.valor_composicao)
      const dataPagamento = date10(b.data_pagamento)
      if (!str(b.id) || !dataPagamento) return null
      return {
        id: String(b.id),
        parcela_id: String(o.id),
        evento_id: str(ev.id),
        tipo: tipoOf(ev.tipo) ?? tipoOf(b.tipo_evento_financeiro),
        data_pagamento: dataPagamento,
        valor_bruto: num(comp.valor_bruto),
        juros: num(comp.juros),
        multa: num(comp.multa),
        desconto: num(comp.desconto),
        taxa: num(comp.taxa),
        valor_liquido: num(comp.valor_liquido),
        conta_financeira_id: str(obj(b.conta_financeira).id) ?? str(b.conta_financeira),
        metodo_pagamento: str(b.metodo_pagamento),
        origem: str(b.origem),
      }
    })
    .filter((b): b is BaixaRow => b !== null)
}

/**
 * Conta Azul repeats the whole evento rateio inside every parcela, so this
 * reads it from a single parcela of the evento (never sums across parcelas).
 * Each category line is exploded by cost centre; any amount not assigned to a
 * cost centre becomes a row with centro_custo_id = null.
 */
export function rateioFromEvento(details: unknown[]): RateioRow[] {
  const first = obj(details[0])
  const ev = obj(first.evento)
  const eventoId = str(ev.id)
  if (!eventoId) return []
  const tipo = tipoOf(ev.tipo)
  const competencia = date10(ev.data_competencia)
  const origem = str(obj(ev.referencia).origem)
  const rateio = Array.isArray(ev.rateio) ? ev.rateio : []

  const rows: RateioRow[] = []
  for (const raw of rateio) {
    const r = obj(raw)
    const base = {
      evento_id: eventoId,
      tipo,
      categoria_id: str(r.id_categoria) ?? str(obj(r.categoria).id),
      categoria_nome: str(r.nome_categoria) ?? str(obj(r.categoria).nome),
      data_competencia: competencia,
      origem,
    }
    const valor = round2(num(r.valor))
    const centros = Array.isArray(r.rateio_centro_custo) ? r.rateio_centro_custo : []
    let assigned = 0
    for (const rawCc of centros) {
      const cc = obj(rawCc)
      const ccValor = round2(num(cc.valor))
      if (ccValor === 0) continue
      assigned = round2(assigned + ccValor)
      rows.push({
        ...base,
        linha: rows.length,
        centro_custo_id: str(cc.id_centro_custo) ?? str(cc.id) ?? str(obj(cc.centro_custo).id),
        valor: ccValor,
      })
    }
    const remainder = round2(valor - assigned)
    if (centros.length === 0 || Math.abs(remainder) >= 0.01) {
      rows.push({ ...base, linha: rows.length, centro_custo_id: null, valor: centros.length === 0 ? valor : remainder })
    }
  }
  return rows
}

/** Splits a payment across categories in proportion to the evento rateio. */
export function apportionByRateio(
  amount: number,
  rateio: { categoria_id: string | null; valor: number }[]
): { categoria_id: string | null; valor: number }[] {
  const total = rateio.reduce((a, r) => a + r.valor, 0)
  if (!total) return []
  return rateio.map((r) => ({ categoria_id: r.categoria_id, valor: round2((amount * r.valor) / total) }))
}

export function cnpjDigits(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  return digits === '' ? null : digits
}

/**
 * Compares the stored mirror with a fresh sweep of the search endpoint.
 * Deletions are only computed from a complete sweep: a partial one (a page that
 * failed, or fewer items than the API's own total) must not erase data.
 */
export function diffSweep(
  stored: Map<string, StoredMeta>,
  fetched: BuscaRow[],
  opts: { complete: boolean }
): { upserts: BuscaRow[]; needDetail: string[]; deleted: string[] } {
  const seen = new Set<string>()
  const needDetail: string[] = []
  for (const row of fetched) {
    seen.add(row.id)
    const prev = stored.get(row.id)
    if (!prev || prev.deleted || !prev.has_payload || prev.detail_alteracao !== row.ca_data_alteracao) {
      needDetail.push(row.id)
    }
  }
  const deleted = opts.complete
    ? Array.from(stored.entries())
        .filter(([id, m]) => !m.deleted && !seen.has(id))
        .map(([id]) => id)
    : []
  return { upserts: fetched, needDetail, deleted }
}
