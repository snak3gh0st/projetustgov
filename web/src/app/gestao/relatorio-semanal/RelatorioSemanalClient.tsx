'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import { HBars } from '@/components/financeiro/charts'
import { count, dayMonth, money, moneyCompact, monthName, signedMoneyCompact, weekday } from '@/components/financeiro/format'
import { Callout, Chip, LoadError, Panel, PanelHead, Pill, SelectField, Skeleton, useFinanceData } from '@/components/financeiro/ui'
import type { ResultadoMes } from '@/lib/financeiro/types'
import type { Relatorio } from '@/lib/relatorio-semanal/types'

type Resposta = {
  relatorio: Relatorio
  gravado: boolean
  enviadoEm: string | null
  semanas: { de: string; ate: string; enviadoEm: string | null }[]
}

const br = (iso: string) => `${dayMonth(iso)}/${iso.slice(0, 4)}`
const signTone = (v: number) => (v < 0 ? 'text-red-700 dark:text-red-300' : v > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-gray-400')

export default function RelatorioSemanalClient() {
  const params = useSearchParams()
  const router = useRouter()
  const semana = params.get('semana')
  const { data, error, loading, reload } = useFinanceData<Resposta>(`/api/gestao/relatorio-semanal${semana ? `?semana=${semana}` : ''}`)

  if (error && !data) return <LoadError message={error} onRetry={() => void reload()} />
  if (!data) return <PaginaSkeleton />

  const r = data.relatorio
  const opcoes = data.semanas.map((s) => ({ value: s.ate, label: `${dayMonth(s.de)} a ${dayMonth(s.ate)}` }))
  if (!opcoes.some((o) => o.value === r.semana.ate)) opcoes.unshift({ value: r.semana.ate, label: `${dayMonth(r.semana.de)} a ${dayMonth(r.semana.ate)} (prévia)` })

  return (
    <div className={`fin mx-auto flex w-full max-w-[1280px] flex-col gap-5 transition-opacity duration-200 ${loading ? 'opacity-70' : ''}`}>
      <PageHeader
        title="Relatório semanal"
        description={`Semana de ${br(r.semana.de)} a ${br(r.semana.ate)} · financeiro do grupo TS&CO e comercial da PROJETUS`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {data.gravado ? (
              <Pill tone="good">{data.enviadoEm ? `Enviado em ${new Date(data.enviadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : 'Gravado'}</Pill>
            ) : (
              <Pill tone="accent">Prévia: enviado sexta às 18h</Pill>
            )}
            {opcoes.length > 1 && (
              <SelectField id="semana" label="Semana" value={r.semana.ate} options={opcoes} onChange={(v) => router.replace(`/gestao/relatorio-semanal?semana=${v}`)} />
            )}
          </div>
        }
      />
      <Alertas r={r} />
      <Kpis r={r} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Agenda r={r} />
        <Empresas r={r} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MovimentoSemana titulo="Recebido na semana" total={r.financeiro.semana.recebido} itens={r.financeiro.semana.recebimentos} />
        <MovimentoSemana titulo="Pago na semana" total={r.financeiro.semana.pago} itens={r.financeiro.semana.pagamentos} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Resultado r={r} />
        <Atrasados r={r} />
      </div>
      <Vendas r={r} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Time r={r} />
        <Funil r={r} />
      </div>
      <Carteira r={r} />
      <p className="text-center text-xs text-slate-500 dark:text-gray-400">
        Financeiro: Conta Azul
        {r.financeiroAte ? `, sincronizado em ${new Date(r.financeiroAte).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : ''}. Comercial: CRM do PROJETE (histórico de
        movimentação desde 21/10/2026). Gerado em {new Date(r.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}.
      </p>
    </div>
  )
}

function PaginaSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5" aria-busy="true" aria-label="Carregando o relatório">
      <Skeleton className="h-16" />
      <Skeleton className="h-28" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  )
}

function Alertas({ r }: { r: Relatorio }) {
  if (!r.alertas.length) return <Callout>Nada fora do normal nesta semana.</Callout>
  return (
    <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2" aria-label="Pontos de atenção">
      {r.alertas.map((a) => (
        <li
          key={a.titulo}
          className={`rounded-lg border-l-4 px-4 py-3 text-[13px] ${
            a.nivel === 'critico'
              ? 'border-red-600 bg-red-50 dark:border-red-400 dark:bg-red-500/10'
              : 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-500/10'
          }`}
        >
          <p className="font-semibold text-slate-900 dark:text-gray-100">{a.titulo}</p>
          <p className="mt-0.5 text-slate-700 dark:text-gray-300">{a.detalhe}</p>
        </li>
      ))}
    </ul>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">{label}</p>
      <p className={`num mt-1.5 truncate text-xl font-bold ${tone ?? 'text-slate-900 dark:text-gray-50'}`}>{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">{sub}</p>}
    </div>
  )
}

function Kpis({ r }: { r: Relatorio }) {
  const f = r.financeiro
  const c = r.comercial
  const variacao = f.saldo.total != null && f.saldo.inicioSemana != null ? f.saldo.total - f.saldo.inicioSemana : null
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Saldo em conta" value={moneyCompact(f.saldo.total)} sub={variacao != null ? `${signedMoneyCompact(variacao)} na semana` : undefined} tone={(f.saldo.total ?? 0) < 0 ? 'text-red-700 dark:text-red-300' : undefined} />
      <Kpi label="Recebido na semana" value={moneyCompact(f.semana.recebido)} />
      <Kpi label="Pago na semana" value={moneyCompact(f.semana.pago)} />
      <Kpi label="Faturamento do mês" value={moneyCompact(f.resultado.mtd.atual)} sub={`mês passado: ${moneyCompact(f.resultado.mtd.anterior)}`} />
      <Kpi label="Vendas na semana" value={`${c.vendas.itens.length} · ${moneyCompact(c.vendas.total)}`} sub={`no mês: ${c.vendas.mes.count} · ${moneyCompact(c.vendas.mes.total)}`} />
      <Kpi label="Posição líquida 12m" value={moneyCompact(f.posicao.liquida)} sub="saldo + a receber − a pagar" tone={signTone(f.posicao.liquida)} />
    </div>
  )
}

function Agenda({ r }: { r: Relatorio }) {
  const [dia, setDia] = useState<string | null>(null)
  const [tipo, setTipo] = useState<'todos' | 'RECEITA' | 'DESPESA'>('todos')
  const { dias, titulos } = r.financeiro.agenda
  const filtrados = useMemo(
    () => titulos.filter((t) => (!dia || t.data_vencimento === dia) && (tipo === 'todos' || t.tipo === tipo)),
    [titulos, dia, tipo]
  )
  const totalReceber = dias.reduce((a, d) => a + d.receber, 0)
  const totalPagar = dias.reduce((a, d) => a + d.pagar, 0)

  return (
    <Panel>
      <PanelHead
        title={`Agenda da próxima semana · ${dayMonth(r.proxima.de)} a ${dayMonth(r.proxima.ate)}`}
        sub="Clique em um dia para ver só os títulos dele."
        aside={
          <span className="num">
            Receber {moneyCompact(totalReceber)} · Pagar {moneyCompact(totalPagar)} ·{' '}
            <span className={signTone(totalReceber - totalPagar)}>{signedMoneyCompact(totalReceber - totalPagar)}</span>
          </span>
        }
      />
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {dias.map((d) => {
          const ativo = dia === d.data
          const vazio = !d.receber && !d.pagar
          return (
            <button
              key={d.data}
              type="button"
              aria-pressed={ativo}
              onClick={() => setDia(ativo ? null : d.data)}
              className={`rounded-lg border p-2.5 text-left transition-colors ${
                ativo ? 'border-slate-900 ring-2 ring-slate-900/10 dark:border-gray-100' : 'border-slate-200 hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-800'
              } ${vazio ? 'opacity-60' : ''}`}
            >
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-gray-400">
                {weekday(d.data)} {dayMonth(d.data)}
              </span>
              <span className="num mt-1 block text-[12px] text-emerald-700 dark:text-emerald-300">+{moneyCompact(d.receber)}</span>
              <span className="num block text-[12px] text-red-700 dark:text-red-300">−{moneyCompact(d.pagar)}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip active={tipo === 'todos'} onClick={() => setTipo('todos')}>Todos</Chip>
        <Chip active={tipo === 'RECEITA'} onClick={() => setTipo('RECEITA')}>A receber</Chip>
        <Chip active={tipo === 'DESPESA'} onClick={() => setTipo('DESPESA')}>A pagar</Chip>
      </div>
      <div className="mt-3 max-h-[360px] overflow-auto">
        {filtrados.length ? (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Vence</th>
                <th className="py-2 pr-3 font-semibold">Quem</th>
                <th className="hidden py-2 pr-3 font-semibold md:table-cell">Categoria</th>
                <th className="py-2 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-gray-800">
                  <td className="num whitespace-nowrap py-2 pr-3 text-slate-600 dark:text-gray-300">{dayMonth(t.data_vencimento)}</td>
                  <td className="w-full max-w-0 py-2 pr-3">
                    <span className="block truncate text-slate-900 dark:text-gray-100">{t.pessoa_nome ?? 'Sem nome'}</span>
                    {t.descricao && <span className="block truncate text-xs text-slate-500 dark:text-gray-400">{t.descricao}</span>}
                  </td>
                  <td className="hidden max-w-[180px] truncate py-2 pr-3 text-slate-600 md:table-cell dark:text-gray-300">{t.categoria ?? '—'}</td>
                  <td className={`num whitespace-nowrap py-2 text-right font-semibold ${t.tipo === 'RECEITA' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {t.tipo === 'RECEITA' ? '+' : '−'}
                    {money(t.nao_pago)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-gray-400">Nenhum título neste filtro.</p>
        )}
      </div>
    </Panel>
  )
}

function Empresas({ r }: { r: Relatorio }) {
  const f = r.financeiro
  return (
    <Panel>
      <PanelHead title="Saldo por empresa" sub={`${f.saldo.contasNegativas} conta${f.saldo.contasNegativas === 1 ? '' : 's'} com saldo negativo no Conta Azul`} />
      <ul className="divide-y divide-slate-100 dark:divide-gray-800">
        {f.porEmpresa.map((e) => (
          <li key={e.empresa} className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]">
            <span className="min-w-0 truncate text-slate-700 dark:text-gray-300">{e.empresa}</span>
            <span className="text-right">
              <span className={`num block font-semibold ${e.saldo < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-gray-100'}`}>{money(e.saldo)}</span>
              {Math.abs(e.variacao) >= 0.01 && <span className={`num block text-xs ${signTone(e.variacao)}`}>{signedMoneyCompact(e.variacao)} na semana</span>}
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 pt-3 text-[13px] font-semibold">
          <span className="text-slate-900 dark:text-gray-100">Total</span>
          <span className={`num ${(f.saldo.total ?? 0) < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-gray-100'}`}>{money(f.saldo.total)}</span>
        </li>
      </ul>
    </Panel>
  )
}

function MovimentoSemana({ titulo, total, itens }: { titulo: string; total: number; itens: Relatorio['financeiro']['semana']['recebimentos'] }) {
  return (
    <Panel>
      <PanelHead title={titulo} aside={<span className="num font-semibold text-slate-900 dark:text-gray-100">{money(total)}</span>} sub={itens.length ? 'Maiores lançamentos' : undefined} />
      {itens.length ? (
        <ul className="divide-y divide-slate-100 dark:divide-gray-800">
          {itens.map((m, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate text-slate-900 dark:text-gray-100">{m.pessoa}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-gray-400">
                  {dayMonth(m.data)}
                  {m.descricao ? ` · ${m.descricao}` : ''}
                </span>
              </span>
              <span className="num whitespace-nowrap font-semibold text-slate-900 dark:text-gray-100">{money(m.valor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 dark:text-gray-400">Nada lançado como pago no Conta Azul nesta semana.</p>
      )}
    </Panel>
  )
}

const LINHAS: { k: keyof ResultadoMes; label: string }[] = [
  { k: 'faturamento', label: 'Faturamento' },
  { k: 'deducoes', label: 'Deduções' },
  { k: 'custos', label: 'Custos' },
  { k: 'despesas', label: 'Despesas' },
  { k: 'outros', label: 'Outros' },
  { k: 'resultado', label: 'Resultado' },
]

function Resultado({ r }: { r: Relatorio }) {
  const { mes, mesAnterior } = r.financeiro.resultado
  const negocios = r.financeiro.porNegocio.filter((n) => n.receita > 0)
  return (
    <Panel>
      <PanelHead title="Resultado" sub="Último mês fechado contra o anterior (competência)" />
      {mes && mesAnterior ? (
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
            <tr>
              <th className="py-1.5 font-semibold" />
              <th className="py-1.5 text-right font-semibold">{monthName(mesAnterior.mes)}</th>
              <th className="py-1.5 text-right font-semibold">{monthName(mes.mes)}</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((l) => (
              <tr key={l.k} className={`border-t border-slate-100 dark:border-gray-800 ${l.k === 'resultado' ? 'font-semibold' : ''}`}>
                <td className="py-1.5 text-slate-700 dark:text-gray-300">{l.label}</td>
                <td className="num py-1.5 text-right text-slate-600 dark:text-gray-400">{moneyCompact(mesAnterior[l.k] as number)}</td>
                <td className={`num py-1.5 text-right ${l.k === 'resultado' ? signTone(mes.resultado) : 'text-slate-900 dark:text-gray-100'}`}>{moneyCompact(mes[l.k] as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500 dark:text-gray-400">Sem DRE fechado para comparar.</p>
      )}
      {negocios.length > 0 && (
        <div className="mt-5">
          <p className="mb-2.5 text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Todas as receitas lançadas no mês, por negócio (até hoje)</p>
          <HBars items={negocios.map((n) => ({ label: n.negocio, value: n.receita, display: moneyCompact(n.receita) }))} color="var(--fin-in)" />
        </div>
      )}
    </Panel>
  )
}

function Atrasados({ r }: { r: Relatorio }) {
  const { receber, pagar } = r.financeiro.atrasados
  const p = r.financeiro.posicao
  return (
    <Panel>
      <PanelHead title="Atrasados e posição" />
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="A receber vencido" value={moneyCompact(receber.total)} sub={`${count(receber.count)} títulos`} tone={receber.total > 0 ? 'text-amber-700 dark:text-amber-300' : undefined} />
        <Kpi label="A pagar em atraso" value={moneyCompact(pagar.total)} sub={`${count(pagar.count)} títulos`} tone={pagar.total > 0 ? 'text-red-700 dark:text-red-300' : undefined} />
      </div>
      {receber.top.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Maiores clientes em atraso</p>
          <ul className="divide-y divide-slate-100 dark:divide-gray-800">
            {receber.top.map((t, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-slate-900 dark:text-gray-100">
                  {t.nome}
                  {t.desde && <span className="text-xs text-slate-500 dark:text-gray-400"> · venceu {dayMonth(t.desde)}</span>}
                </span>
                <span className="num whitespace-nowrap font-semibold">{money(t.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pagar.nomes.length > 0 && <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">A pagar em atraso: {pagar.nomes.join(', ')}.</p>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[13px] dark:border-gray-800">
        <dt className="text-slate-500 dark:text-gray-400">A receber (12 meses)</dt>
        <dd className="num text-right">{moneyCompact(p.receber)}</dd>
        <dt className="text-slate-500 dark:text-gray-400">A pagar (12 meses)</dt>
        <dd className="num text-right">{moneyCompact(p.pagar)}</dd>
        <dt className="text-slate-500 dark:text-gray-400">Empréstimos</dt>
        <dd className="num text-right">{moneyCompact(p.emprestimos)}</dd>
        <dt className="font-semibold text-slate-900 dark:text-gray-100">Posição líquida</dt>
        <dd className={`num text-right font-semibold ${signTone(p.liquida)}`}>{moneyCompact(p.liquida)}</dd>
      </dl>
    </Panel>
  )
}

function Vendas({ r }: { r: Relatorio }) {
  const v = r.comercial.vendas
  const max = Math.max(1, ...v.serie.map((s) => s.total))
  return (
    <Panel>
      <PanelHead title="Vendas fechadas · PROJETUS" sub="Leads com venda fechada no CRM nesta semana" aside={<span className="num font-semibold text-slate-900 dark:text-gray-100">{money(v.total)}</span>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        {v.itens.length ? (
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">Cliente</th>
                <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Serviço</th>
                <th className="py-2 pr-3 font-semibold">Vendedor</th>
                <th className="py-2 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {v.itens.map((x, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-gray-800">
                  <td className="w-full max-w-0 py-2 pr-3">
                    <span className="block truncate text-slate-900 dark:text-gray-100">{x.cliente}</span>
                    <span className="block text-xs text-slate-500 dark:text-gray-400">
                      {dayMonth(x.data)}
                      {x.local ? ` · ${x.local}` : ''}
                    </span>
                  </td>
                  <td className="hidden py-2 pr-3 text-slate-600 sm:table-cell dark:text-gray-300">{x.servico}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-gray-300">{x.vendedor}</td>
                  <td className="num whitespace-nowrap py-2 text-right font-semibold">{money(x.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500 dark:text-gray-400">
            Nenhuma venda fechada na semana. No mês: {v.mes.count} ({moneyCompact(v.mes.total)}).
          </p>
        )}
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Últimas 8 semanas</p>
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={v.serie.map((s) => `semana de ${dayMonth(s.semana)}: ${s.count} vendas, ${moneyCompact(s.total)}`).join('; ')}>
            {v.serie.map((s) => (
              <div key={s.semana} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dayMonth(s.semana)}: ${s.count} · ${moneyCompact(s.total)}`}>
                <span className="num text-[10px] text-slate-500 dark:text-gray-400">{s.count || ''}</span>
                <div className="w-full rounded-t" style={{ height: `${Math.max(2, (s.total / max) * 100)}%`, background: s.total ? 'var(--fin-in)' : 'var(--fin-grid)' }} />
                <span className="num text-[10px] text-slate-500 dark:text-gray-400">{dayMonth(s.semana)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}

function Time({ r }: { r: Relatorio }) {
  return (
    <Panel>
      <PanelHead title="Time comercial na semana" sub={`${count(r.comercial.distribuidos)} leads distribuídos na semana`} />
      <table className="w-full text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-gray-400">
          <tr>
            <th className="py-2 pr-3 font-semibold">Vendedor</th>
            <th className="py-2 pr-3 text-right font-semibold">Trabalhados</th>
            <th className="py-2 pr-3 text-right font-semibold">Avanços</th>
            <th className="py-2 pr-3 text-right font-semibold">Perdas</th>
            <th className="py-2 text-right font-semibold">Vendas</th>
          </tr>
        </thead>
        <tbody>
          {r.comercial.time.map((v) => (
            <tr key={v.nome} className="border-t border-slate-100 dark:border-gray-800">
              <td className="py-2 pr-3 text-slate-900 dark:text-gray-100">{v.nome}</td>
              <td className="num py-2 pr-3 text-right">{count(v.trabalhados)}</td>
              <td className="num py-2 pr-3 text-right">{count(v.avancos)}</td>
              <td className="num py-2 pr-3 text-right">{count(v.perdas)}</td>
              <td className="num py-2 text-right">{v.vendas ? `${v.vendas} · ${moneyCompact(v.valorVendido)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">
        Trabalhados: leads com etapa alterada pelo vendedor. Avanços: atendimento, reunião, proposta ou aprovação. Perdas: sem interesse ou churn.
      </p>
    </Panel>
  )
}

function Funil({ r }: { r: Relatorio }) {
  const temAnterior = r.comercial.funil.some((f) => f.anterior != null)
  return (
    <Panel>
      <PanelHead title="Funil hoje" sub={temAnterior ? 'Leads por etapa e mudança desde o último relatório' : 'Leads por etapa'} />
      <ul className="divide-y divide-slate-100 dark:divide-gray-800">
        {r.comercial.funil.map((f) => {
          const delta = f.anterior == null ? null : f.leads - f.anterior
          return (
            <li key={f.status} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
              <span className="text-slate-700 dark:text-gray-300">{f.status}</span>
              <span className="num">
                <span className="font-semibold text-slate-900 dark:text-gray-100">{count(f.leads)}</span>
                {delta != null && delta !== 0 && <span className={`ml-2 text-xs ${delta > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-gray-400'}`}>{delta > 0 ? `+${count(delta)}` : `−${count(-delta)}`}</span>}
              </span>
            </li>
          )
        })}
      </ul>
      {r.comercial.movimento.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[12.5px] font-medium text-slate-500 dark:text-gray-400">Leads que entraram em cada etapa nesta semana</p>
          <div className="flex flex-wrap gap-1.5">
            {r.comercial.movimento.map((m) => (
              <Pill key={m.etapa} tone={m.etapa === 'Sem Interesse' || m.etapa === 'Churn' ? 'warn' : m.etapa === 'Fechado' ? 'good' : 'neutral'}>
                {m.etapa} <span className="num">{count(m.leads)}</span>
              </Pill>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Carteira({ r }: { r: Relatorio }) {
  const c = r.comercial.carteira
  return (
    <Panel>
      <PanelHead title="Carteira de vendas no financeiro" sub={`${count(c.clientes)} clientes com venda no CRM, cruzados pelo CNPJ com o Conta Azul (acumulado)`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Vendido" value={moneyCompact(c.vendido)} />
        <Kpi label="Faturado" value={moneyCompact(c.faturado)} />
        <Kpi label="Recebido" value={moneyCompact(c.recebido)} tone="text-emerald-700 dark:text-emerald-300" />
        <Kpi label="Em aberto" value={moneyCompact(c.aberto)} />
        <Kpi label="Vencido" value={moneyCompact(c.vencido)} tone={c.vencido > 0 ? 'text-amber-700 dark:text-amber-300' : undefined} />
      </div>
    </Panel>
  )
}
