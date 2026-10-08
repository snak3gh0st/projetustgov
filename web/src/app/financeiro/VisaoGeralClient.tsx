'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { BalanceChart, Sparkline, StackBar, type BalancePoint } from '@/components/financeiro/charts'
import { MINUS, count, dayMonth, money, moneyCompact, monthName, pct, signedPct, weekday } from '@/components/financeiro/format'
import { TituloSlideOver } from '@/components/financeiro/SlideOver'
import { AGING_COLORS, AGING_LABELS, Callout, LoadError, Panel, PanelHead, Pill, Skeleton, Swatch, useFinanceData } from '@/components/financeiro/ui'
import type { ResultadoMes, TituloRow, Overview } from '@/lib/financeiro/types'

export default function VisaoGeralClient() {
  const { data, error, loading, reload } = useFinanceData<Overview>('/api/financeiro/overview')
  const [open, setOpen] = useState<string | null>(null)
  const close = useCallback(() => setOpen(null), [])

  if (error && !data) return <LoadError message={error} onRetry={() => void reload()} />
  if (!data) return <OverviewSkeleton />

  return (
    <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
        <BalancePanel data={data} />
        <UpcomingPanel data={data} onOpen={setOpen} />
      </div>
      <ResultPanel data={data} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ReceivablesPanel data={data} />
        <PayablesPanel data={data} />
      </div>
      <PositionPanel data={data} />
      <TituloSlideOver id={open} onClose={close} />
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Carregando a visão geral">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
        <Skeleton className="h-[380px]" />
        <Skeleton className="h-[380px]" />
      </div>
      <Skeleton className="h-[170px]" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[260px]" />
      </div>
    </div>
  )
}

/* Saldo + projection ------------------------------------------------------ */

function BalancePanel({ data }: { data: Overview }) {
  const points = useMemo<BalancePoint[]>(() => {
    const realized = data.saldoSerie.filter((s) => s.date < data.today).map((s) => ({ date: s.date, balance: s.balance, projected: false }))
    const projected = data.projecao.map((p, i) => ({ date: p.date, balance: p.balance, net: p.net, projected: i > 0 }))
    return [...realized, ...projected]
  }, [data])

  const total = data.saldo.total
  const [reais, centavos] = money(total ?? 0).split(',')
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-slate-600 dark:text-gray-400">Saldo em contas</div>
          <div className={`mt-1 text-[34px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px] ${total !== null && total < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-50'}`}>
            {total === null ? '—' : reais}
            {total !== null && <span className="text-[22px] font-medium text-slate-500 dark:text-gray-400">,{centavos}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 dark:text-gray-400">
            {data.saldo.variacao30 !== null ? (
              <>
                <span className={data.saldo.variacao30 >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                  {data.saldo.variacao30 >= 0 ? '+' : MINUS} {moneyCompact(Math.abs(data.saldo.variacao30))}
                </span>
                <span>desde {dayMonth(data.saldo.desde)}</span>
              </>
            ) : (
              <span>Histórico diário começa em {dayMonth(data.saldo.desde ?? data.today)}</span>
            )}
            <span aria-hidden="true">·</span>
            <span>{data.saldo.contas} contas</span>
            {data.saldo.negativas > 0 && (
              <Link href="/financeiro/caixa#contas">
                <Pill tone="bad">{data.saldo.negativas} com saldo negativo</Pill>
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3.5 text-[12.5px] text-slate-600 dark:text-gray-400" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2" style={{ borderColor: 'var(--fin-in)' }} />
            Realizado
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--fin-in)' }} />
            Previsto
          </span>
        </div>
      </div>
      <div className="mt-3.5">
        <BalanceChart points={points} today={data.today} />
      </div>
      <p className="mt-2 text-[12.5px] text-slate-500 dark:text-gray-400">
        Previsão pelos títulos já lançados no Conta Azul com vencimento a partir de hoje. Vencidos ficam de fora.
      </p>
    </Panel>
  )
}

/* Next 7 days ------------------------------------------------------------- */

function TxRow({ t, onOpen }: { t: TituloRow; onOpen: (id: string) => void }) {
  const isIn = t.tipo === 'RECEITA'
  return (
    <button
      type="button"
      onClick={() => onOpen(t.id)}
      className="grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/60"
    >
      <span
        className={`grid h-[26px] w-[26px] place-items-center rounded-full ${isIn ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-slate-100 dark:bg-gray-800'}`}
        aria-hidden="true"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: isIn ? 'var(--fin-in)' : 'var(--fin-out)' }}>
          {isIn ? <path d="M12 5v14M5 12l7 7 7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-gray-100">{t.pessoa_nome ?? 'Sem nome'}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-gray-400">{t.descricao ?? t.categoria ?? ''}</span>
      </span>
      <span className="text-right">
        <span className="block text-[13px] font-semibold tabular-nums text-slate-900 dark:text-gray-100">
          {isIn ? '+' : MINUS} {moneyCompact(t.nao_pago).replace(`${MINUS} `, '')}
        </span>
        {t.status.key === 'vencido' && (
          <span className={`block text-[11.5px] ${t.status.tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-gray-400'}`}>
            {t.status.days} {t.status.days === 1 ? 'dia' : 'dias'}
          </span>
        )}
      </span>
    </button>
  )
}

function UpcomingPanel({ data, onOpen }: { data: Overview; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, TituloRow[]>()
    for (const t of data.proximos7) {
      const d = t.data_vencimento ?? data.today
      map.set(d, [...(map.get(d) ?? []), t])
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [data])
  const inflow = data.proximos7.filter((t) => t.tipo === 'RECEITA').reduce((a, t) => a + t.nao_pago, 0)
  const outflow = data.proximos7.filter((t) => t.tipo === 'DESPESA').reduce((a, t) => a + t.nao_pago, 0)

  return (
    <Panel className="flex flex-col xl:relative xl:min-h-[420px]">
      <PanelHead
        title="Próximos 7 dias"
        aside={
          <span className="tabular-nums">
            + {moneyCompact(inflow).replace('R$ ', '')} · {MINUS} {moneyCompact(outflow).replace('R$ ', '')}
          </span>
        }
      />
      <div className="flex max-h-[480px] flex-col gap-3.5 overflow-y-auto pr-1 xl:absolute xl:inset-x-5 xl:bottom-4 xl:top-[58px] xl:max-h-none">
        {data.atrasados.count > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 pb-1.5 pt-2.5 dark:border-amber-500/20 dark:bg-amber-500/10">
            <div className="flex justify-between border-b border-amber-200 pb-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:text-amber-300">
              <span>Recebimentos atrasados · {count(data.atrasados.count)}</span>
              <span className="tabular-nums">{moneyCompact(data.atrasados.total)}</span>
            </div>
            {data.atrasados.top.map((t) => (
              <TxRow key={t.id} t={t} onOpen={onOpen} />
            ))}
            <Link href="/financeiro/pagar-receber?tipo=receber&filtro=vencido" className="block px-1 pb-0.5 pt-1.5 text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-300">
              Ver os {count(data.atrasados.count)} atrasados
            </Link>
          </div>
        )}
        {groups.length === 0 && <p className="text-[13px] text-slate-500 dark:text-gray-400">Nenhum título a pagar ou receber nos próximos 7 dias.</p>}
        {groups.map(([date, items]) => {
          const net = items.reduce((a, t) => a + (t.tipo === 'RECEITA' ? t.nao_pago : -t.nao_pago), 0)
          const offset = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${data.today}T12:00:00Z`)) / 86_400_000)
          const label = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : weekday(date).replace(/^./, (c) => c.toUpperCase())
          return (
            <div key={date}>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 text-xs font-semibold text-slate-500 dark:border-gray-800 dark:text-gray-400">
                <span>
                  {label}, {dayMonth(date)}
                </span>
                <span className={`font-medium tabular-nums ${net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {net >= 0 ? '+' : ''}
                  {moneyCompact(net)}
                </span>
              </div>
              {items.map((t) => (
                <TxRow key={t.id} t={t} onOpen={onOpen} />
              ))}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* Result of the last closed month ----------------------------------------- */

function Term({ label, value, prev, invert, op }: { label: string; value: number; prev: number; invert?: boolean; op?: string }) {
  const delta = prev ? (value - prev) / Math.abs(prev) : null
  const good = delta === null ? true : invert ? delta <= 0 : delta >= 0
  return (
    <>
      <div className="flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-lg bg-slate-50 px-3.5 py-2.5 sm:bg-transparent dark:bg-gray-800/50 sm:dark:bg-transparent">
        <span className="text-[12.5px] font-medium text-slate-600 dark:text-gray-400">{label}</span>
        <span className="text-xl font-semibold tabular-nums tracking-[-0.01em] text-slate-900 dark:text-gray-50">{moneyCompact(value)}</span>
        {delta !== null && Number.isFinite(delta) && (
          <span className="text-xs text-slate-500 dark:text-gray-400">
            <span className={good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{signedPct(delta)}</span> vs mês anterior
          </span>
        )}
      </div>
      {op && (
        <span className="hidden w-[18px] flex-none place-items-center text-[22px] text-slate-400 sm:grid dark:text-gray-500" aria-hidden="true">
          {op}
        </span>
      )}
    </>
  )
}

function ResultPanel({ data }: { data: Overview }) {
  const r: ResultadoMes | null = data.resultado.atual
  const p: ResultadoMes | null = data.resultado.anterior
  if (!r || !p) return null
  const fora = data.resultado.foraDoDre
  const foraRelevante = r.faturamento > 0 ? Math.abs(fora) > r.faturamento * 0.05 : Math.abs(fora) > 0
  const margin = r.faturamento ? r.resultado / r.faturamento : null
  const prevMargin = p.faturamento ? p.resultado / p.faturamento : null
  const mtd = data.resultado.mtd

  return (
    <Panel>
      <PanelHead
        title={`Resultado de ${monthName(r.mes)}`}
        aside={
          <>
            Último mês fechado, por competência ·{' '}
            <Link href="/financeiro/resultado" className="font-medium text-blue-700 hover:underline dark:text-blue-300">
              Abrir o resultado completo
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-stretch gap-1.5">
        <Term label="Faturamento" value={r.faturamento} prev={p.faturamento} op={MINUS} />
        <Term label="Impostos e comissões" value={-r.deducoes} prev={-p.deducoes} invert op={MINUS} />
        <Term label="Custos dos serviços" value={-r.custos} prev={-p.custos} invert op={MINUS} />
        <Term label="Despesas operacionais" value={-r.despesas} prev={-p.despesas} invert op={MINUS} />
        <Term label="Financeiro e investimentos" value={-r.outros} prev={-p.outros} invert op="=" />
        <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-lg bg-blue-50 px-3.5 py-2.5 dark:bg-blue-500/10">
          <span className="text-[12.5px] font-medium text-slate-700 dark:text-gray-300">Resultado final</span>
          <span className={`text-2xl font-semibold tabular-nums tracking-[-0.01em] ${r.resultado < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-50'}`}>
            {moneyCompact(r.resultado)}
          </span>
          <span className="text-xs text-slate-600 dark:text-gray-400">
            Margem {pct(margin)} · {monthName(p.mes)} {pct(prevMargin)}
          </span>
        </div>
      </div>
      {foraRelevante && (
        <div className="mt-3.5">
          <Callout tone="warn">
            <Pill tone="warn">Atenção</Pill>
            <span className="min-w-[220px] flex-1">
              <b className="tabular-nums">{moneyCompact(fora)}</b> em lançamentos de {monthName(r.mes)} estão em categorias sem linha no DRE do Conta Azul e não entram no resultado acima.{' '}
              <Link href="/financeiro/resultado#fora-do-dre" className="font-medium underline">
                Ver categorias
              </Link>
            </span>
          </Callout>
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5 text-[13px] text-slate-600 dark:border-gray-800 dark:text-gray-400">
        <span>
          Mês atual até hoje: <b className="tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(mtd.atual)}</b> de receita bruta em {mtd.diasUteis}{' '}
          {mtd.diasUteis === 1 ? 'dia útil' : 'dias úteis'}. No mesmo ponto do mês anterior: {moneyCompact(mtd.mesmoPontoAnterior)}.
        </span>
      </div>
    </Panel>
  )
}

/* Receivables and payables ------------------------------------------------ */

function ReceivablesPanel({ data }: { data: Overview }) {
  const rec = data.receber
  return (
    <Panel>
      <PanelHead
        title="A receber"
        aside={
          <Link href="/financeiro/pagar-receber?tipo=receber&filtro=vencido" className="hover:underline">
            Ver títulos
          </Link>
        }
      />
      <div className="text-[26px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-gray-50">
        {moneyCompact(rec.aberto)} <span className="text-sm font-medium text-slate-500 dark:text-gray-400">em aberto</span>
      </div>
      <StackBar
        label="Valor a receber por faixa de atraso"
        segments={rec.aging.map((v, i) => ({ label: AGING_LABELS[i], value: v, color: AGING_COLORS[i], display: money(v) }))}
      />
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
        {rec.aging.map((v, i) => (
          <div key={AGING_LABELS[i]} className="flex flex-col gap-px text-xs text-slate-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={AGING_COLORS[i]} />
              {AGING_LABELS[i]}
            </span>
            <b className="text-[13.5px] font-semibold tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(v)}</b>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-7 border-t border-slate-200 pt-3.5 dark:border-gray-800">
        <div>
          <div className="text-[12.5px] text-slate-600 dark:text-gray-400">Vencido</div>
          <div className={`text-[17px] font-semibold tabular-nums ${rec.vencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(rec.vencido)}</div>
        </div>
        <div>
          <div className="text-[12.5px] text-slate-600 dark:text-gray-400">Inadimplência (12 meses)</div>
          <div className="text-[17px] font-semibold tabular-nums text-slate-900 dark:text-gray-100">{pct(rec.inadimplencia)}</div>
        </div>
        <div className="ml-auto text-right">
          <Sparkline values={rec.inadimplenciaSerie.map((s) => s.taxa)} width={120} height={34} />
          <div className="text-xs text-slate-500 dark:text-gray-400">por mês de vencimento</div>
        </div>
      </div>
    </Panel>
  )
}

function PayablesPanel({ data }: { data: Overview }) {
  const weeks = data.pagar.semanas
  const total = weeks.reduce((a, w) => a + w.valor, 0)
  const max = Math.max(1, ...weeks.map((w) => w.valor))
  const late = data.pagar.atrasados
  return (
    <Panel>
      <PanelHead
        title="A pagar"
        aside={
          <Link href="/financeiro/pagar-receber?tipo=pagar&filtro=30" className="hover:underline">
            Ver títulos
          </Link>
        }
      />
      <div className="text-[26px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-gray-50">
        {moneyCompact(total)} <span className="text-sm font-medium text-slate-500 dark:text-gray-400">nas próximas 4 semanas</span>
      </div>
      <div className="mt-2.5 grid h-[150px] grid-cols-4 items-end gap-2.5" role="img" aria-label="Valor a pagar por semana">
        {weeks.map((w, i) => (
          <div key={w.from} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(w.valor).replace('R$ ', '')}</span>
            <div className="w-full max-w-[24px] rounded-t" style={{ height: `${Math.max(4, (w.valor / max) * 100)}px`, background: 'var(--fin-out)' }} />
            <span className="whitespace-nowrap text-[11.5px] text-slate-500 dark:text-gray-400">{i === 0 ? 'Esta semana' : `${dayMonth(w.from)} a ${dayMonth(w.to)}`}</span>
          </div>
        ))}
      </div>
      {late.count > 0 && (
        <div className="mt-3.5">
          <Callout>
            <Pill tone="warn">{count(late.count)} em atraso</Pill>
            <span className="min-w-[200px] flex-1">
              {late.nomes.join(', ')}
              {late.count > late.nomes.length ? ' e outros' : ''}, somando <b className="tabular-nums">{moneyCompact(late.total)}</b>, incluídos na primeira semana.
            </span>
          </Callout>
        </div>
      )}
    </Panel>
  )
}

/* Financial position ------------------------------------------------------ */

function PositionPanel({ data }: { data: Overview }) {
  const p = data.posicao
  const Item = ({ label, value }: { label: string; value: number }) => (
    <span>
      {label} <b className={`text-base font-semibold tabular-nums ${value < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(value)}</b>
    </span>
  )
  const Op = ({ c }: { c: string }) => <span className="text-base text-slate-400 dark:text-gray-500">{c}</span>
  return (
    <Panel>
      <PanelHead title="Posição financeira" aside={`Vencidos e o que vence até ${dayMonth(p.horizonte)}/${p.horizonte.slice(0, 4)}. Não substitui o balanço contábil.`} />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-gray-400">
        <Item label="Saldo em contas" value={p.saldo} />
        <Op c="+" />
        <Item label="A receber" value={p.receber} />
        <Op c={MINUS} />
        <Item label="A pagar" value={p.pagar} />
        <Op c={MINUS} />
        <Item label="Empréstimos a vencer" value={p.emprestimos} />
        <Op c="=" />
        <span>
          Posição líquida{' '}
          <b className={`text-lg font-semibold tabular-nums ${p.liquida < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(p.liquida)}</b>
        </span>
      </div>
      {(p.longoPrazo.pagar > 0 || p.longoPrazo.receber > 0) && (
        <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] text-slate-600 dark:border-gray-800 dark:text-gray-400">
          Longo prazo, depois de 12 meses: a pagar <b className="tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(p.longoPrazo.pagar)}</b>
          {p.longoPrazo.receber > 0 && (
            <>
              {' '}e a receber <b className="tabular-nums text-slate-900 dark:text-gray-100">{moneyCompact(p.longoPrazo.receber)}</b>
            </>
          )}
          , fora da posição líquida acima.
        </p>
      )}
    </Panel>
  )
}
