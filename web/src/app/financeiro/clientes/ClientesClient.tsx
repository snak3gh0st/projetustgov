'use client'

import { useCallback, useMemo, useState } from 'react'
import { HBars, StackBar } from '@/components/financeiro/charts'
import { MINUS, count, fullDate, money, moneyCompact, pct } from '@/components/financeiro/format'
import { KeyValues, SlideOver } from '@/components/financeiro/SlideOver'
import { Callout, Chip, LoadError, Panel, PanelHead, Pill, SelectField, Skeleton, useFinanceData } from '@/components/financeiro/ui'
import type { CrmStatus, StatusTone } from '@/lib/financeiro/assemble'
import type { ClienteCrmRow, ClientesResponse } from '@/lib/financeiro/types'

const STATUS: Record<CrmStatus, { label: string; tone: StatusTone; color: string }> = {
  ok: { label: 'Conciliado', tone: 'good', color: 'var(--fin-good)' },
  semfat: { label: 'Venda sem faturamento', tone: 'warn', color: 'var(--fin-warn)' },
  diverg: { label: 'Valores divergentes', tone: 'bad', color: 'var(--fin-bad)' },
  semcrm: { label: 'Sem venda no CRM', tone: 'neutral', color: 'var(--fin-neutral)' },
}
const ORDER: CrmStatus[] = ['ok', 'semfat', 'diverg', 'semcrm']

function formatDoc(doc: string) {
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return doc
}

export default function ClientesClient() {
  const { data, error, loading, reload } = useFinanceData<ClientesResponse>('/api/financeiro/clientes')
  const [status, setStatus] = useState<CrmStatus | 'all'>('all')
  const [seller, setSeller] = useState('all')
  const [open, setOpen] = useState<ClienteCrmRow | null>(null)
  const close = useCallback(() => setOpen(null), [])

  const sellers = useMemo(() => {
    const s = new Set<string>()
    data?.rows.forEach((r) => r.vendedor?.split(', ').forEach((v) => s.add(v)))
    return Array.from(s).sort()
  }, [data])

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => (status === 'all' || r.status === status) && (seller === 'all' || (r.vendedor ?? '').split(', ').includes(seller))),
    [data, status, seller]
  )

  if (error && !data) return <LoadError message={error} onRetry={() => void reload()} />
  if (!data)
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[520px]" />
      </div>
    )

  const withSale = data.counts.ok + data.counts.semfat + data.counts.diverg
  const billed = data.counts.ok + data.counts.diverg

  return (
    <div className={`flex flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <Panel>
          <PanelHead title="Conciliação entre vendas do CRM e faturamento" aside="Cruzamento pelo CNPJ do cliente" />
          <p className="mb-1 text-[15px] text-slate-800 dark:text-gray-200">
            <b className="tabular-nums">
              {count(billed)} de {count(withSale)}
            </b>{' '}
            vendas fechadas no CRM já têm faturamento no Conta Azul.
          </p>
          <StackBar label="Clientes por situação de conciliação" segments={ORDER.map((k) => ({ label: STATUS[k].label, value: data.counts[k], color: STATUS[k].color, display: `${count(data.counts[k])} clientes` }))} />
          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
            <Chip active={status === 'all'} onClick={() => setStatus('all')}>
              Todos <span className="tabular-nums opacity-75">{count(data.rows.length)}</span>
            </Chip>
            {ORDER.map((k) => (
              <Chip key={k} active={status === k} onClick={() => setStatus(k)}>
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS[k].color }} />
                {STATUS[k].label} <span className="tabular-nums opacity-75">{count(data.counts[k])}</span>
              </Chip>
            ))}
          </div>
          {data.counts.semfat > 0 && (
            <div className="mt-3.5">
              <Callout>
                <span>
                  &quot;Venda sem faturamento&quot; aparece quando o CNPJ da venda no CRM não tem nenhum lançamento no Conta Azul: venda ainda não faturada, cliente cadastrado sem CNPJ ou com outro CNPJ no Conta Azul.
                </span>
              </Callout>
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHead title="Recebido por vendedor" aside="Clientes conciliados pelo CNPJ" />
          {data.porVendedor.length ? (
            <HBars color="var(--fin-in)" items={data.porVendedor.map((s) => ({ label: s.vendedor, value: s.recebido, display: moneyCompact(s.recebido) }))} />
          ) : (
            <p className="text-[13px] text-slate-500 dark:text-gray-400">Nenhuma venda do CRM conciliada com recebimentos ainda.</p>
          )}
          <p className="mt-3.5 text-[12.5px] text-slate-500 dark:text-gray-400">Base para os indicadores da fase 2: churn, velocidade de vendas e projeção de receita.</p>
        </Panel>
      </div>

      <Panel>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-gray-100">Clientes</h2>
          <SelectField id="crm-seller" label="Vendedor" value={seller} onChange={setSeller} options={[{ value: 'all', label: 'Todos' }, ...sellers.map((s) => ({ value: s, label: s }))]} />
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg bg-slate-100 px-3.5 py-3 text-[13px] text-slate-700 dark:bg-gray-800 dark:text-gray-300">Nenhum cliente com esse vendedor e situação. Ajuste os filtros.</p>
        ) : (
          <div className="max-h-[680px] overflow-auto rounded-lg border border-slate-200 dark:border-gray-800">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-[1] bg-slate-100 text-[11.5px] uppercase tracking-[0.03em] text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vendedor</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Vendido (CRM)</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Faturado</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Recebido</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Vencido</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr
                    key={r.doc}
                    tabIndex={0}
                    onClick={() => setOpen(r)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(r))}
                    className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60"
                  >
                    <td className="max-w-[300px] px-3 py-2">
                      <div className="truncate font-medium text-slate-900 dark:text-gray-100">{r.nome}</div>
                      <div className="font-mono text-xs text-slate-500 dark:text-gray-400">{formatDoc(r.doc)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {r.vendedor ? (
                        <>
                          <div className="text-slate-800 dark:text-gray-200">{r.vendedor}</div>
                          {r.servico && <div className="text-xs text-slate-500 dark:text-gray-400">{r.servico}</div>}
                        </>
                      ) : (
                        <span className="text-slate-500 dark:text-gray-400">Sem venda</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.vendido ? money(r.vendido) : <span className="text-slate-400">{MINUS}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.faturado ? money(r.faturado) : <span className="text-slate-400">{MINUS}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.recebido ? money(r.recebido) : <span className="text-slate-400">{MINUS}</span>}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.vencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>{r.vencido > 0 ? money(r.vencido) : MINUS}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SlideOver open={Boolean(open)} onClose={close} kicker="Cliente" title={open?.nome ?? ''}>
        {open && (
          <>
            <div>
              <Pill tone={STATUS[open.status].tone}>{STATUS[open.status].label}</Pill>
            </div>
            <KeyValues
              items={[
                ['CNPJ', <span key="d" className="font-mono text-xs">{formatDoc(open.doc)}</span>],
                ['Vendedor', open.vendedor ?? 'Sem venda no CRM'],
                ['Serviço', open.servico ?? '—'],
                ['Venda fechada', open.fechamento ? fullDate(open.fechamento) : '—'],
                ['Vendido', money(open.vendido)],
                ['Faturado', money(open.faturado)],
                ['Recebido', money(open.recebido)],
                ['Em aberto', money(open.aberto)],
                ['Vencido', money(open.vencido)],
              ]}
            />
            {open.status === 'semfat' && <Callout>A venda foi fechada{open.fechamento ? ` em ${fullDate(open.fechamento)}` : ''}, mas nenhum lançamento com este CNPJ existe no Conta Azul.</Callout>}
            {open.status === 'diverg' && <Callout tone="warn">O faturado é {pct(open.faturado / open.vendido)} do valor vendido. Confira se faltam parcelas no Conta Azul ou se a venda foi renegociada.</Callout>}
            {open.status === 'semcrm' && <Callout>Cliente com faturamento no Conta Azul e nenhuma venda registrada no CRM com este CNPJ.</Callout>}
          </>
        )}
      </SlideOver>
    </div>
  )
}
