'use client'

import { useEffect, useState } from 'react'
import { todaySP } from '@/lib/conta-azul/finance/dates'
import type { CommercialActivityRow } from '@/lib/commercial-activity'

export default function CommercialDailyActivity({ seller }: { seller: string }) {
  const [day, setDay] = useState(() => todaySP())
  const [rows, setRows] = useState<CommercialActivityRow[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setRows(null); setError('')
    const q = new URLSearchParams({ data: day })
    if (seller) q.set('vendedor_id', seller)
    fetch(`/api/gestao/atividade-diaria?${q}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Falha ao carregar'); if (!controller.signal.aborted) setRows(d.consultores) })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [day, seller])
  return <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-labelledby="atividade-diaria-titulo">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 id="atividade-diaria-titulo" className="font-semibold text-ink">Atividade diária</h2><p className="mt-1 text-xs text-ink-3">Contatos e movimentações por consultor · horário de Brasília</p></div>
      <label className="text-xs text-ink-2">Data <input aria-label="Data da atividade" type="date" required value={day} max={todaySP()} onChange={(e) => { if (e.target.value) setDay(e.target.value) }} className="ml-2 rounded-lg border border-line bg-surface p-2 text-ink" /></label>
    </div>
    {error ? <p role="alert" className="p-4 text-sm text-red-700">{error}</p> : rows === null ? <p role="status" className="p-4 text-sm text-ink-3">Carregando atividade…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="border-y border-line bg-raised text-xs text-ink-2"><tr>{['Consultor', 'Contatos únicos', 'Mensagens enviadas', 'E-mails pelo Workspace', 'Oportunidades movimentadas', 'Perdas', 'Ligações manuais'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.length ? rows.map((r) => <tr key={r.id}><td className="px-4 py-2 text-ink">{r.nome}</td>{[r.contatos, r.mensagens, r.emails, r.movimentados, r.perdas, r.ligacoes_manuais].map((v, i) => <td key={i} className="px-4 py-2 tabular-nums text-ink-2">{v}</td>)}</tr>) : <tr><td colSpan={7} className="p-4 text-ink-3">Nenhum consultor encontrado.</td></tr>}</tbody>
    </table></div>}
    <p className="p-4 text-xs leading-relaxed text-ink-3">Contatos únicos incluem registros manuais e envios pela Projete. Mensagens pelo celular sem autor identificado não são atribuídas a um consultor. As ligações VoIP aparecerão após a integração do provedor.</p>
  </section>
}
