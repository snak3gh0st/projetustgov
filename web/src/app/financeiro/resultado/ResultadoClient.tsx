'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ResultChart } from '@/components/financeiro/charts'
import { PeriodAndCostCentre, useUrlParam } from '@/components/financeiro/Filters'
import { MINUS, axis, moneyCompact, monthShort, pct } from '@/components/financeiro/format'
import { Callout, LoadError, Panel, PanelHead, Pill, Segmented, Skeleton, Swatch, useFinanceData } from '@/components/financeiro/ui'
import type { ResultadoResponse } from '@/lib/financeiro/types'

type Row = ResultadoResponse['rows'][number]

export default function ResultadoClient() {
  const [period] = useUrlParam('period', '12')
  const [cc] = useUrlParam('cc', 'all')
  const [regime, setRegime] = useUrlParam('regime', 'comp')
  const qs = new URLSearchParams({ period, cc, regime }).toString()
  const { data, error, loading, reload } = useFinanceData<ResultadoResponse>(`/api/financeiro/resultado?${qs}`)
  const [presenting, setPresenting] = useState(false)

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPresenting(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting])

  const totals = useMemo(() => {
    if (!data) return null
    const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
    const receita = sum(data.chart.receita)
    const resultado = sum(data.chart.resultado)
    return { receita, resultado, margem: receita ? resultado / receita : null, fora: sum(data.foraDoDre.values) }
  }, [data])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <PeriodAndCostCentre />
        <div className="flex-1" />
        <Segmented
          label="Regime"
          value={regime as 'comp' | 'cash'}
          onChange={setRegime}
          options={[
            { value: 'comp', label: 'Competência' },
            { value: 'cash', label: 'Caixa' },
          ]}
        />
        <button
          type="button"
          onClick={() => setPresenting(true)}
          disabled={!data}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Modo apresentação
        </button>
        <a
          href={`/api/financeiro/resultado/csv?${qs}`}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-900 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Exportar CSV
        </a>
      </div>

      {error && !data && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && (
        <>
          <Skeleton className="h-[380px]" />
          <Skeleton className="h-[520px]" />
        </>
      )}

      {data && totals && (
        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
          <Panel>
            <PanelHead
              title="Receita, custos e resultado"
              sub={regime === 'cash' ? 'Regime de caixa: pela data do pagamento' : 'Regime de competência: pelo mês do serviço'}
              aside={
                <span className="inline-flex flex-wrap gap-3.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color="var(--fin-in)" /> Receita bruta
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color="var(--fin-out)" /> Custos e despesas
                  </span>
                </span>
              }
            />
            <p className="mb-2.5 text-[13px] text-slate-600 dark:text-gray-400">
              No período: receita <b className="tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(totals.receita)}</b>, resultado{' '}
              <b className={`tabular-nums ${totals.resultado < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(totals.resultado)}</b>, margem{' '}
              <b className="tabular-nums text-slate-900 dark:text-gray-100">{pct(totals.margem)}</b>
            </p>
            <ResultChart months={data.months} receita={data.chart.receita} gastos={data.chart.gastos} resultado={data.chart.resultado} />
          </Panel>

          <Panel>
            <PanelHead title="Demonstração do resultado" aside="Estrutura do DRE configurada no Conta Azul · clique numa linha para ver as categorias" />
            <DreTable data={data} />
            <p className="mt-2.5 text-[12.5px] text-slate-500 dark:text-gray-400">
              Valores negativos com sinal de menos. Δ compara o último mês com o anterior. AV% é a participação sobre a receita bruta do período.
            </p>
          </Panel>

          <ForaDoDre data={data} total={totals.fora} />
        </div>
      )}

      {presenting && data && (
        <div className="fin fixed inset-0 z-[60] overflow-y-auto bg-slate-50 px-6 py-6 sm:px-12 dark:bg-gray-950" role="dialog" aria-modal="true" aria-label="Resultado em modo apresentação">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-[32px] font-bold tracking-[-0.02em] text-slate-900 dark:text-gray-50">Resultado</h2>
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  {monthShort(data.months[0])} a {monthShort(data.months[data.months.length - 1])} · {regime === 'cash' ? 'regime de caixa' : 'regime de competência'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPresenting(false)}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-900 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                Sair da apresentação (Esc)
              </button>
            </div>
            <Panel>
              <ResultChart months={data.months} receita={data.chart.receita} gastos={data.chart.gastos} resultado={data.chart.resultado} />
            </Panel>
            <Panel>
              <DreTable data={data} large />
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function DreTable({ data, large = false }: { data: ResultadoResponse; large?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const n = data.months.length
  const receitaTotal = data.chart.receita.reduce((a, b) => a + b, 0)
  const finalId = [...data.rows].reverse().find((r) => r.totalizador && r.parent_id === null)?.id

  const cells = (values: number[]) => {
    const total = values.reduce((a, b) => a + b, 0)
    const cur = values[n - 1] ?? 0
    const prev = values[n - 2] ?? 0
    const delta = prev ? (cur - prev) / Math.abs(prev) : null
    return (
      <>
        {values.map((v, i) => (
          <td key={i} className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${v < -0.004 ? 'text-red-600 dark:text-red-400' : ''} ${i === n - 1 ? 'shadow-[inset_1px_0_0_rgb(203_213_225)] dark:shadow-[inset_1px_0_0_rgb(55_65_81)]' : ''}`}>
            {Math.abs(v) < 0.5 ? <span className="text-slate-400 dark:text-gray-500">{MINUS}</span> : axis(v)}
          </td>
        ))}
        <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${total < -0.004 ? 'text-red-600 dark:text-red-400' : ''}`}>{axis(total)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500 dark:text-gray-400">{receitaTotal ? pct(total / receitaTotal) : '—'}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
          {delta === null || !Number.isFinite(delta) ? (
            <span className="text-slate-400 dark:text-gray-500">{MINUS}</span>
          ) : (
            <span className={Math.abs(delta) < 0.05 ? 'text-slate-500 dark:text-gray-400' : cur - prev >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
              {cur - prev >= 0 ? '▲' : '▼'} {pct(Math.abs(delta))}
            </span>
          )}
        </td>
      </>
    )
  }

  const rowClass = (r: Row) => {
    if (r.totalizador) return `font-bold ${r.id === finalId ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-slate-50 dark:bg-gray-800/60'} [&>td]:border-t [&>td]:border-slate-300 dark:[&>td]:border-gray-700`
    if (r.nivel === 0) return 'font-semibold'
    return ''
  }
  const stickyBg = (r: Row) => (r.totalizador ? (r.id === finalId ? 'bg-blue-50 dark:bg-[#0f1d33]' : 'bg-slate-50 dark:bg-gray-800') : 'bg-white dark:bg-gray-900')

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
      <table className={`w-full border-separate border-spacing-0 ${large ? 'text-[15px]' : 'text-[13px]'} text-slate-800 dark:text-gray-200`}>
        <thead>
          <tr className="text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:text-gray-400">
            <th className="sticky left-0 z-[2] min-w-[260px] border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-left font-semibold dark:border-gray-800 dark:bg-gray-800">Linha</th>
            {data.months.map((m) => (
              <th key={m} className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-right font-semibold dark:border-gray-800 dark:bg-gray-800">
                {monthShort(m)}
              </th>
            ))}
            <th className="border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-right font-semibold dark:border-gray-800 dark:bg-gray-800">Total</th>
            <th className="border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-right font-semibold dark:border-gray-800 dark:bg-gray-800">AV%</th>
            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-100 px-3 py-2.5 text-right font-semibold dark:border-gray-800 dark:bg-gray-800">Δ mês</th>
          </tr>
        </thead>
        <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-100 dark:[&>tr>td]:border-gray-800">
          {data.rows.map((r) => {
            const canOpen = r.categorias.length > 0
            const isOpen = Boolean(open[r.id])
            return (
              <Fragment key={r.id}>
                <tr className={rowClass(r)}>
                  <td className={`sticky left-0 z-[1] px-3 py-2 ${stickyBg(r)}`} style={{ paddingLeft: 12 + r.nivel * 18 }}>
                    {canOpen ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                        className="inline-flex items-center gap-1.5 text-left hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <svg className={`h-3 w-3 flex-none text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                        {r.codigo && <span className="mr-1 font-medium tabular-nums text-slate-500 dark:text-gray-400">{r.codigo}</span>}
                        {r.descricao}
                      </button>
                    ) : (
                      <span>
                        {r.codigo && <span className="mr-1 font-medium tabular-nums text-slate-500 dark:text-gray-400">{r.codigo}</span>}
                        {r.descricao}
                      </span>
                    )}
                  </td>
                  {cells(r.values)}
                </tr>
                {isOpen &&
                  r.categorias.map((c) => (
                    <tr key={`${r.id}:${c.id ?? c.nome}`} className="text-slate-600 dark:text-gray-400">
                      <td className="sticky left-0 z-[1] bg-white px-3 py-1.5 dark:bg-gray-900" style={{ paddingLeft: 12 + (r.nivel + 1) * 18 + 18 }}>
                        {c.nome}
                      </td>
                      {cells(c.values)}
                    </tr>
                  ))}
              </Fragment>
            )
          })}
          <tr className="text-amber-800 dark:text-amber-300">
            <td className="sticky left-0 z-[1] bg-white px-3 py-2 dark:bg-gray-900">
              <a href="#fora-do-dre" className="hover:underline">
                Lançamentos fora do DRE
              </a>
            </td>
            {cells(data.foraDoDre.values)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ForaDoDre({ data, total }: { data: ResultadoResponse; total: number }) {
  const cats = data.foraDoDre.categorias
  if (!cats.length) return null
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
  return (
    <Panel id="fora-do-dre">
      <PanelHead
        title="Lançamentos fora do DRE"
        aside={<span className="tabular-nums">{moneyCompact(total)} no período</span>}
      />
      <Callout tone="warn">
        <Pill tone="warn">Classificar no Conta Azul</Pill>
        <span className="min-w-[240px] flex-1">
          Estas categorias não têm linha no DRE do Conta Azul, por isso ficam fora do resultado, como no relatório do próprio Conta Azul. Distribuição de lucros, empréstimos recebidos e
          transferências entre empresas costumam ficar fora de propósito. As demais devem ser classificadas no cadastro de categorias do Conta Azul; a próxima sincronização atualiza este
          resultado.
        </span>
      </Callout>
      <div className="mt-3.5 overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-100 text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Categoria</th>
              <th className="px-3 py-2.5 text-right font-semibold">No período</th>
              <th className="px-3 py-2.5 text-right font-semibold">Último mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {cats.slice(0, 30).map((c) => {
              const t = sum(c.values)
              const last = c.values[c.values.length - 1] ?? 0
              return (
                <tr key={c.id ?? c.nome}>
                  <td className="px-3 py-2 text-slate-800 dark:text-gray-200">{c.nome}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${t < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(t)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${last < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-gray-300'}`}>
                    {Math.abs(last) < 0.5 ? MINUS : moneyCompact(last)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {cats.length > 30 && <p className="mt-2 text-[12.5px] text-slate-500 dark:text-gray-400">Mais {cats.length - 30} categorias menores no CSV.</p>}
    </Panel>
  )
}
