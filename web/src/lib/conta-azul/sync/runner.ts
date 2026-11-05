import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { getContaAzulConfig } from '../config'
import { getValidAccessToken } from '../connection'
import { addDaysISO, todaySP } from '../finance/dates'
import {
  categoriaFromApi,
  centroCustoFromApi,
  contaFinanceiraFromApi,
  diffSweep,
  listItems,
  listTotal,
  parcelaFromBusca,
  parcelaFromDetail,
  pessoaFromApi,
  saldoFromApi,
  totalsFromBusca,
  type ApiTotals,
  type PessoaRow,
} from '../finance/derive'
import { dreCategoryPairs, flattenDreTree, type DreNode } from '../finance/dre'
import type { BuscaRow, Tipo } from '../finance/types'
import { ContaAzulReconnectRequiredError } from '../token-refresh'
import { CaHttpError, createCaClient, type CaClient } from './client'
import { reconcile, type ApiSideTotals } from './reconcile'
import {
  failStaleRuns,
  finishRun,
  getRunningRun,
  insertRun,
  lastFinishedRun,
  patchRun,
  type PullTrigger,
} from './runs'
import {
  activeContaIds,
  getActiveConnectionId,
  loadStoredMeta,
  markDeleted,
  mirrorSums,
  pendingDetailIds,
  rateioMismatchCount,
  replaceDre,
  saveEventoDetails,
  upsertBusca,
  upsertCategorias,
  upsertCentrosCusto,
  upsertContasFinanceiras,
  upsertPessoas,
  upsertSaldo,
} from './store'

/**
 * Pull sync from Conta Azul into the finance mirror.
 * Steps: dimensions -> balances -> people -> id sweep -> details (time budget, 3 workers) -> reconciliation.
 * A run that hits its time budget ends as `partial`; the next run picks up the
 * remaining details because "pending" is simply detail older than the search.
 */

export const CRON_BUDGET_MS = 12 * 60_000
export const WEB_BUDGET_MS = 10 * 60_000
const WEB_COOLDOWN_MS = 2 * 60_000
const SWEEP_PAGE = 1000
const DIM_PAGE = 500
const PROGRESS_EVERY = 25
const DETAIL_WORKERS = 3

const PATHS: Record<Tipo, string> = {
  RECEITA: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
  DESPESA: '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
}

export class ContaAzulNotActiveError extends Error {
  constructor() {
    super('Conta Azul não está conectado')
    this.name = 'ContaAzulNotActiveError'
  }
}

export type StartResult = { runId: string; connectionId: string; existing: boolean }

export async function startPullRun(trigger: PullTrigger): Promise<StartResult> {
  const { tenantKey } = getContaAzulConfig()
  const connectionId = await getActiveConnectionId(tenantKey)
  if (!connectionId) throw new ContaAzulNotActiveError()

  await failStaleRuns(connectionId)

  if (trigger === 'web') {
    const last = await lastFinishedRun(connectionId)
    if (last?.finished_at && Date.now() - new Date(last.finished_at).getTime() < WEB_COOLDOWN_MS) {
      return { runId: last.id, connectionId, existing: true }
    }
  }

  const runId = await insertRun(connectionId, trigger)
  if (runId) return { runId, connectionId, existing: false }
  const running = await getRunningRun(connectionId)
  if (!running) throw new Error('Não foi possível iniciar a sincronização do Conta Azul')
  return { runId: running.id, connectionId, existing: true }
}

function defaultClient(): CaClient {
  return createCaClient({
    fetch: (url, init) => fetch(url, init),
    getToken: (opts) => getValidAccessToken(opts),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  })
}

async function pagedList(client: CaClient, path: string, query: Record<string, string | number | boolean | string[]>, pageSize: number) {
  const items: unknown[] = []
  for (let pagina = 1; pagina <= 200; pagina++) {
    const body = await client.get(path, { ...query, pagina, tamanho_pagina: pageSize })
    const page = listItems(body)
    items.push(...page)
    const total = listTotal(body)
    if (page.length < pageSize || (total !== null && items.length >= total)) break
  }
  return items
}

async function syncDimensions(client: CaClient) {
  const categorias = await pagedList(client, '/v1/categorias', { permite_apenas_filhos: false }, DIM_PAGE)
  await upsertCategorias(categorias.map(categoriaFromApi))

  const tree = listItems(await client.get('/v1/financeiro/categorias-dre')) as DreNode[]
  await replaceDre(flattenDreTree(tree), dreCategoryPairs(tree))

  const centros = await pagedList(client, '/v1/centro-de-custo', { filtro_rapido: 'TODOS' }, 100)
  await upsertCentrosCusto(centros.map(centroCustoFromApi))

  const contas = await pagedList(client, '/v1/conta-financeira', {}, 100)
  await upsertContasFinanceiras(contas.map(contaFinanceiraFromApi))

  return { categorias: categorias.length, dre_linhas: tree.length, centros: centros.length, contas: contas.length }
}

async function syncSaldos(client: CaClient) {
  const today = todaySP()
  let n = 0
  for (const id of await activeContaIds()) {
    const saldo = saldoFromApi(await client.get(`/v1/conta-financeira/${encodeURIComponent(id)}/saldo-atual`))
    if (saldo === null) continue
    await upsertSaldo(id, today, saldo)
    n += 1
  }
  return n
}

type SweepResult = { rows: BuscaRow[]; total: number | null; totals: ApiTotals; complete: boolean }

async function sweep(client: CaClient, tipo: Tipo): Promise<SweepResult> {
  const window = { data_vencimento_de: '2000-01-01', data_vencimento_ate: addDaysISO(todaySP(), 3650) }
  const rows: BuscaRow[] = []
  let total: number | null = null
  let totals: ApiTotals = { pago: null, aberto: null, vencido: null, todos: null }
  for (let pagina = 1; pagina <= 100; pagina++) {
    const body = await client.get(PATHS[tipo], { ...window, pagina, tamanho_pagina: SWEEP_PAGE })
    if (pagina === 1) {
      total = listTotal(body)
      totals = totalsFromBusca(body)
    }
    const page = listItems(body)
    rows.push(...page.map((item) => parcelaFromBusca(item, tipo)))
    if (page.length < SWEEP_PAGE || (total !== null && rows.length >= total)) break
  }
  const unique = new Map(rows.map((r) => [r.id, r]))
  return { rows: Array.from(unique.values()), total, totals, complete: total !== null && unique.size === total }
}

async function syncPessoas(client: CaClient) {
  const byId = new Map<string, PessoaRow>()
  for (const perfil of ['Cliente', 'Fornecedor']) {
    for (const tipoPessoa of ['Jurídica', 'Física']) {
      const items = await pagedList(client, '/v1/pessoas', { tipo_perfil: perfil, tipos_pessoa: tipoPessoa }, DIM_PAGE)
      for (const item of items) {
        const p = pessoaFromApi(item)
        const prev = byId.get(p.id)
        const perfis = new Set([...(prev?.perfis ?? []), ...p.perfis, perfil])
        byId.set(p.id, { ...p, tipo_pessoa: p.tipo_pessoa ?? tipoPessoa, perfis: Array.from(perfis) })
      }
    }
  }
  await upsertPessoas(Array.from(byId.values()))
  return byId.size
}

export type RunSummary = {
  runId: string
  status: 'completed' | 'partial' | 'failed'
  error?: string
  metadata: Record<string, unknown>
}

export async function executePullRun(
  runId: string,
  connectionId: string,
  budgetMs: number,
  client: CaClient = defaultClient()
): Promise<RunSummary> {
  const deadline = Date.now() + budgetMs
  const meta: Record<string, unknown> = {}
  let detailsDone = 0
  let detailsFailed = 0
  let pendingTotal = 0

  const phase = async (name: string, extra: Record<string, unknown> = {}) => {
    Object.assign(meta, extra, { phase: name })
    await patchRun(runId, { ...meta, api_calls: client.calls() })
  }

  try {
    await phase('dimensoes')
    meta.dimensoes = await syncDimensions(client)

    await phase('saldos')
    meta.saldos = await syncSaldos(client)

    await phase('pessoas')
    meta.pessoas = await syncPessoas(client)

    await phase('varredura')
    const apiTotals: ApiSideTotals = {
      RECEITA: { itens: null, pago: null, aberto: null },
      DESPESA: { itens: null, pago: null, aberto: null },
    }
    let sweepComplete = true
    const sweepInfo: Record<string, unknown> = {}
    for (const tipo of ['RECEITA', 'DESPESA'] as const) {
      const s = await sweep(client, tipo)
      const diff = diffSweep(await loadStoredMeta(connectionId, tipo), s.rows, { complete: s.complete })
      await upsertBusca(connectionId, diff.upserts)
      await markDeleted(diff.deleted)
      apiTotals[tipo] = { itens: s.total, pago: s.totals.pago, aberto: s.totals.aberto }
      sweepComplete &&= s.complete
      sweepInfo[tipo] = { itens: s.rows.length, total_api: s.total, removidos: diff.deleted.length, alterados: diff.needDetail.length, totais_api: s.totals }
    }
    meta.varredura = sweepInfo

    const pending = await pendingDetailIds(connectionId)
    pendingTotal = pending.length
    await phase('detalhes', { progress: { done: 0, total: pendingTotal } })

    // A few workers share the client's 8 req/s throttle; a single sequential
    // loop is bound by API latency (~3 req/s). An evento being saved by one
    // worker is skipped by the others, since its rateio is replaced as a unit.
    const done = new Set<string>()
    const inFlightEventos = new Set<string>()
    let budgetExhausted = false
    let quotaHit = false
    let cursor = 0
    let fatal: unknown = null

    const worker = async () => {
      while (!fatal && !quotaHit) {
        const id = pending[cursor++]
        if (id === undefined) return
        if (done.has(id)) continue
        if (Date.now() > deadline) {
          budgetExhausted = true
          return
        }
        let claimed: string | null = null
        try {
          const detail = await client.get(`/v1/financeiro/eventos-financeiros/parcelas/${encodeURIComponent(id)}`)
          const d = parcelaFromDetail(detail)
          if (d.evento_id) {
            if (inFlightEventos.has(d.evento_id)) continue
            inFlightEventos.add(d.evento_id)
            claimed = d.evento_id
          }
          let details: unknown[] = [detail]
          if (d.quantidade_parcelas > 1 && d.evento_id) {
            const siblings = listItems(
              await client.get(`/v1/financeiro/eventos-financeiros/${encodeURIComponent(d.evento_id)}/parcelas`)
            )
            if (siblings.length) details = siblings
          }
          const saved = await saveEventoDetails(connectionId, details)
          saved.forEach((x) => done.add(x))
          done.add(id)
          detailsDone += 1
        } catch (err) {
          if (err instanceof ContaAzulReconnectRequiredError) {
            fatal = err
            return
          }
          if (err instanceof CaHttpError && err.status === 429) {
            // Conta Azul quota exhausted even after backing off: stop cleanly,
            // the next run resumes the remaining details.
            quotaHit = true
            return
          }
          detailsFailed += 1
          meta.ultimo_erro_detalhe = err instanceof Error ? err.message.slice(0, 300) : String(err)
          if (detailsFailed > 25 && detailsFailed > detailsDone) {
            fatal = err
            return
          }
        } finally {
          if (claimed) inFlightEventos.delete(claimed)
        }
        if ((detailsDone + detailsFailed) % PROGRESS_EVERY === 0) {
          await phase('detalhes', { progress: { done: done.size, total: pendingTotal } })
        }
      }
    }
    await Promise.all(Array.from({ length: DETAIL_WORKERS }, () => worker()))
    if (fatal) throw fatal
    meta.detalhes = {
      pendentes: pendingTotal,
      atualizados: done.size,
      chamadas: detailsDone,
      falhas: detailsFailed,
      orcamento_esgotado: budgetExhausted,
      cota_excedida: quotaHit,
    }

    await phase('conferencia')
    const rec = sweepComplete ? reconcile(apiTotals, await mirrorSums(connectionId)) : { ok: false, checks: [] }
    meta.conferencia = { ...rec, varredura_completa: sweepComplete, rateio_divergente: await rateioMismatchCount(connectionId) }

    const status = budgetExhausted || quotaHit || !rec.ok || detailsFailed > 0 ? 'partial' : 'completed'
    meta.api_calls = client.calls()
    meta.phase = 'concluido'
    await finishRun(runId, status, { total: pendingTotal, success: done.size, failed: detailsFailed }, meta, null)
    return { runId, status, metadata: meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[conta-azul/sync] run failed:', message)
    Sentry.captureException(err, { tags: { area: 'conta-azul-sync' }, extra: { runId } })
    meta.api_calls = client.calls()
    meta.phase = 'falhou'
    await finishRun(runId, 'failed', { total: pendingTotal, success: detailsDone, failed: detailsFailed + 1 }, meta, message.slice(0, 1000)).catch(
      (e) => console.error('[conta-azul/sync] could not record failure:', e)
    )
    return { runId, status: 'failed', error: message, metadata: meta }
  }
}
