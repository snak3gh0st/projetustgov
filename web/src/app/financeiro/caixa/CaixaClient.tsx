'use client'

import { useState } from 'react'
import { CashFlowChart, HBars, Sparkline } from '@/components/financeiro/charts'
import { PeriodAndCostCentre, useUrlParam } from '@/components/financeiro/Filters'
import { MINUS, dayMonth, money, moneyCompact } from '@/components/financeiro/format'
import { Callout, LoadError, Panel, PanelHead, Pill, Skeleton, Swatch, useFinanceData } from '@/components/financeiro/ui'
import type { CaixaResponse } from '@/lib/financeiro/types'

const TIPO_CONTA: Record<string, string> = {
  CONTA_CORRENTE: 'Conta corrente',
  APLICACAO: 'Aplicação',
  INVESTIMENTO: 'Investimento',
  CARTAO_CREDITO: 'Cartão de crédito',
  CAIXINHA: 'Caixinha',
  POUPANCA: 'Poupança',
  OUTROS: 'Outros',
}

export default function CaixaClient() {
  const [period] = useUrlParam('period', '12')
  const [cc] = useUrlParam('cc', 'all')
  const { data, error, loading, reload } = useFinanceData<CaixaResponse>(`/api/financeiro/caixa?${new URLSearchParams({ period, cc })}`)
  const [showEmpty, setShowEmpty] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <PeriodAndCostCentre />
      </div>

      {error && !data && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && (
        <>
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[480px]" />
        </>
      )}

      {data && (
        <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
          <Panel>
            <PanelHead
              title="Entradas e saídas"
              sub="Pagamentos e recebimentos efetivos. Os três últimos meses são previsão pelos títulos em aberto."
              aside={
                <span className="inline-flex flex-wrap gap-3.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color="var(--fin-in)" /> Entradas
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color="var(--fin-out)" /> Saídas
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color="var(--fin-in-soft)" /> Previsto
                  </span>
                </span>
              }
            />
            <CashFlowChart meses={data.meses} />
            {cc !== 'all' && <p className="mt-2 text-[12.5px] text-slate-500 dark:text-gray-400">Os meses previstos consideram todos os centros de custo.</p>}
          </Panel>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
            <Panel>
              <PanelHead title="Projeção de 13 semanas" aside="Pelos títulos em aberto com vencimento a partir de hoje" />
              {data.semanas.weeks.length > 0 && (
                <div className="mb-3.5">
                  <Callout tone={data.semanas.weeks[data.semanas.minIndex].end < 0 ? 'warn' : 'neutral'}>
                    <Pill tone={data.semanas.weeks[data.semanas.minIndex].end < 0 ? 'bad' : 'warn'}>Menor saldo</Pill>
                    <span>
                      Menor saldo previsto: <b className="tabular-nums">{moneyCompact(data.semanas.weeks[data.semanas.minIndex].end)}</b> na semana de{' '}
                      {dayMonth(data.semanas.weeks[data.semanas.minIndex].from)}.
                    </span>
                  </Callout>
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-800">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-100 text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">Semana</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Saldo inicial</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Entradas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Saídas</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Saldo final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {data.semanas.weeks.map((w, i) => (
                      <tr key={w.from}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-800 dark:text-gray-200">
                          {dayMonth(w.from)} a {dayMonth(w.to)}
                          {i === data.semanas.minIndex && <span className="ml-2"><Pill tone="warn">Menor saldo</Pill></span>}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${w.start < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{moneyCompact(w.start)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">+ {moneyCompact(w.inflow).replace('R$ ', '')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {MINUS} {moneyCompact(w.outflow).replace('R$ ', '')}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${w.end < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(w.end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Para onde foi o dinheiro" aside="Saídas pagas no período" />
              {data.saidasPorCategoria.length ? (
                <HBars color="var(--fin-out)" items={data.saidasPorCategoria.map((c) => ({ label: c.nome, value: c.valor, display: moneyCompact(c.valor) }))} />
              ) : (
                <p className="text-[13px] text-slate-500 dark:text-gray-400">Nenhuma saída paga neste período.</p>
              )}
            </Panel>
          </div>

          <Panel id="contas">
            <PanelHead title="Contas" aside={<>Saldo atual informado pelo Conta Azul · total <b className="tabular-nums">{money(data.saldoTotal)}</b></>} />
            {data.contas.some((c) => (c.saldo ?? 0) < 0) && (
              <div className="mb-2">
                <Callout>
                  <span>
                    Contas com saldo negativo no Conta Azul costumam indicar extrato não conciliado ou saldo inicial não lançado. Confira a conciliação bancária dessas contas no Conta Azul.
                  </span>
                </Callout>
              </div>
            )}
            <div className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.contas.map((c) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[13px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_110px_minmax(130px,auto)]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-gray-100">{c.nome}</div>
                    <div className="text-xs text-slate-500 dark:text-gray-400">{c.banco ?? '—'}</div>
                  </div>
                  <div className="hidden text-slate-500 md:block dark:text-gray-400">{TIPO_CONTA[c.tipo ?? ''] ?? c.tipo ?? '—'}</div>
                  <div className="hidden md:block">
                    <Sparkline values={c.serie} />
                  </div>
                  <div className={`text-right font-semibold tabular-nums ${(c.saldo ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>
                    {money(c.saldo)}
                    {(c.saldo ?? 0) < 0 && (
                      <div className="mt-1">
                        <Pill tone="bad">Saldo negativo</Pill>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {data.contasSemSaldo.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  aria-expanded={showEmpty}
                  onClick={() => setShowEmpty((v) => !v)}
                  className="py-1.5 text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  {showEmpty ? 'Ocultar contas sem saldo' : `Mostrar ${data.contasSemSaldo.length} contas sem saldo ou inativas`}
                </button>
                {showEmpty && (
                  <p className="pt-1 text-[12.5px] text-slate-500 dark:text-gray-400">
                    {data.contasSemSaldo.map((c) => `${c.nome}${c.ativo ? '' : ' (inativa)'}`).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}
