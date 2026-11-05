'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { Sparkline, StackBar } from '@/components/financeiro/charts'
import { useUrlParam } from '@/components/financeiro/Filters'
import { MINUS, count, fullDate, money, moneyCompact, pct } from '@/components/financeiro/format'
import { TituloSlideOver } from '@/components/financeiro/SlideOver'
import { AGING_COLORS, AGING_LABELS, Chip, LoadError, Panel, PanelHead, Pill, Segmented, Skeleton, Swatch, useFinanceData } from '@/components/financeiro/ui'
import type { TitulosResponse } from '@/lib/financeiro/types'

const FILTERS = [
  { key: 'vencido', label: 'Vencidos' },
  { key: 'hoje', label: 'Vence hoje' },
  { key: '7', label: 'Próximos 7 dias' },
  { key: '30', label: 'Próximos 30 dias' },
  { key: 'pago', label: 'Liquidados' },
  { key: 'all', label: 'Todos' },
]

export default function PagarReceberClient() {
  const router = useRouter()
  const pathname = usePathname()
  const [tipo] = useUrlParam('tipo', 'receber')
  const [filtro, setFiltro] = useUrlParam('filtro', tipo === 'pagar' ? '30' : 'vencido')
  const [grouped, setGrouped] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const isR = tipo !== 'pagar'
  const { data, error, loading, reload } = useFinanceData<TitulosResponse>(`/api/financeiro/titulos?${new URLSearchParams({ tipo, filtro })}`)

  const groups = useMemo(() => {
    if (!data) return []
    const map = new Map<string, { n: number; valor: number; vencido: number; maiorAtraso: number }>()
    for (const t of data.rows) {
      const key = t.pessoa_nome ?? 'Sem nome'
      const g = map.get(key) ?? { n: 0, valor: 0, vencido: 0, maiorAtraso: 0 }
      g.n += 1
      g.valor += t.nao_pago > 0 ? t.nao_pago : t.valor_total
      if (t.status.key === 'vencido') {
        g.vencido += t.nao_pago
        g.maiorAtraso = Math.max(g.maiorAtraso, t.status.days ?? 0)
      }
      map.set(key, g)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].valor - a[1].valor)
  }, [data])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Tipo de título"
          value={isR ? 'receber' : 'pagar'}
          onChange={(v) => {
            // switching type resets the filter to that type's default
            router.replace(v === 'pagar' ? `${pathname}?tipo=pagar` : pathname, { scroll: false })
          }}
          options={[
            { value: 'receber', label: 'A receber' },
            { value: 'pagar', label: 'A pagar' },
          ]}
        />
      </div>

      {error && !data && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && (
        <>
          <Skeleton className="h-[180px]" />
          <Skeleton className="h-[520px]" />
        </>
      )}

      {data && (
        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
          <Panel>
            <PanelHead title={isR ? 'Contas a receber' : 'Contas a pagar'} aside={`${isR ? 'Clientes' : 'Fornecedores'} e títulos do Conta Azul`} />
            <div className="flex flex-wrap items-end gap-8">
              <div>
                <div className="text-[13px] font-medium text-slate-600 dark:text-gray-400">Em aberto</div>
                <div className="text-[26px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-gray-50">{moneyCompact(data.aberto)}</div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-slate-600 dark:text-gray-400">Vencido</div>
                <div className={`text-[26px] font-semibold tracking-[-0.01em] ${data.vencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-50'}`}>
                  {moneyCompact(data.vencido)}
                </div>
              </div>
              {data.inadimplencia !== null && (
                <>
                  <div>
                    <div className="text-[13px] font-medium text-slate-600 dark:text-gray-400">Inadimplência (12 meses)</div>
                    <div className="text-[26px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-gray-50">{pct(data.inadimplencia)}</div>
                  </div>
                  <Sparkline values={data.inadimplenciaSerie.map((s) => s.taxa)} width={140} height={40} />
                </>
              )}
            </div>
            <StackBar
              label="Distribuição do valor em aberto por faixa de atraso"
              segments={data.aging.map((v, i) => ({ label: AGING_LABELS[i], value: v, color: AGING_COLORS[i], display: money(v) }))}
            />
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
              {data.aging.map((v, i) => (
                <div key={AGING_LABELS[i]} className="flex flex-col gap-px text-xs text-slate-600 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color={AGING_COLORS[i]} />
                    {AGING_LABELS[i]}
                  </span>
                  <b className="text-[13.5px] font-semibold tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(v)}</b>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Filtrar títulos" className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <Chip key={f.key} active={data.filtro === f.key} onClick={() => setFiltro(f.key)}>
                    {f.label} <span className="tabular-nums opacity-75">{count(data.counts[f.key] ?? 0)}</span>
                  </Chip>
                ))}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-slate-600 dark:text-gray-300">
                <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Agrupar por {isR ? 'cliente' : 'fornecedor'}
              </label>
            </div>

            {data.rows.length === 0 ? (
              <p className="rounded-lg bg-slate-100 px-3.5 py-3 text-[13px] text-slate-700 dark:bg-gray-800 dark:text-gray-300">
                Nenhum título neste filtro. {data.filtro === 'vencido' ? 'Nada vencido em aberto.' : 'Escolha outro filtro acima.'}
              </p>
            ) : grouped ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-100 text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">{isR ? 'Cliente' : 'Fornecedor'}</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Títulos</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Vencido</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Maior atraso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {groups.map(([nome, g]) => (
                      <tr key={nome}>
                        <td className="max-w-[320px] truncate px-3 py-2 font-medium text-slate-900 dark:text-gray-100">{nome}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{g.n}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(g.valor)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${g.vencido ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>{g.vencido ? money(g.vencido) : MINUS}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{g.maiorAtraso ? `${g.maiorAtraso} dias` : MINUS}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="max-h-[640px] overflow-auto rounded-lg border border-slate-200 dark:border-gray-800">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">Vencimento</th>
                      <th className="px-3 py-2.5 text-left font-semibold">{isR ? 'Cliente' : 'Fornecedor'} e descrição</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Categoria</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Em aberto</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {data.rows.map((t) => (
                      <tr
                        key={t.id}
                        tabIndex={0}
                        onClick={() => setOpen(t.id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(t.id))}
                        className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60"
                      >
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fullDate(t.data_vencimento)}</td>
                        <td className="max-w-[300px] px-3 py-2">
                          <div className="truncate font-medium text-slate-900 dark:text-gray-100">{t.pessoa_nome ?? 'Sem nome'}</div>
                          <div className="truncate text-xs text-slate-500 dark:text-gray-400">{t.descricao ?? ''}</div>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-gray-400">{t.categoria ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(t.valor_total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{t.nao_pago > 0 ? money(t.nao_pago) : <span className="text-slate-400">{MINUS}</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Pill tone={t.status.tone}>{t.status.label}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.rows.length >= 1000 && <p className="mt-2 text-[12.5px] text-slate-500 dark:text-gray-400">Mostrando os primeiros 1.000 títulos deste filtro.</p>}
          </Panel>
        </div>
      )}
      <TituloSlideOver id={open} onClose={close} />
    </div>
  )
}
