'use client'

import { useEffect, useState } from 'react'
import { formatCurrencyFull, formatDate, parseCurrencyInput } from '@/lib/format'

// ---------------------------------------------------------------------------
// ValorContrato — valor da venda fechada pelo Comercial para o CNPJ.
// Sem valor no Comercial, a Aprovação informa o valor à mão (editable) e a
// Execução vê esse valor.
// ---------------------------------------------------------------------------

interface ValorManual {
  valor: number
  por: string | null
  em: string
}

interface ValorContratoData {
  valor: number | null
  vendas: number
  semValor: number
  manual: ValorManual | null
  canEditManual: boolean
}

export default function ValorContrato({
  cnpj,
  nrProposta,
  editable = false,
}: {
  cnpj: string | null
  nrProposta: string
  editable?: boolean
}) {
  const [data, setData] = useState<ValorContratoData | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const digits = (cnpj ?? '').replace(/\D/g, '')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(false)
    setEditing(false)
    const params = new URLSearchParams({ nr_proposta: nrProposta })
    if (digits.length === 14) params.set('cnpj', digits)
    fetch(`/api/tgov/valor-contrato?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ValorContratoData>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [digits, nrProposta])

  async function saveManual() {
    const valor = parseCurrencyInput(input)
    if (!Number.isFinite(valor) || valor <= 0) {
      setSaveError('Informe o valor (ex.: 120.000,00)')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/tgov/valor-contrato', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nr_proposta: nrProposta, valor }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setData((prev) => (prev ? { ...prev, manual: body.manual } : prev))
      setEditing(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function startEditing() {
    setSaveError(null)
    setInput(data?.manual
      ? data.manual.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '')
    setEditing(true)
  }

  const canEditManual = editable && !!data?.canEditManual

  let content: React.ReactNode
  if (error) {
    content = <p className="text-xs text-red-500">Erro ao carregar o valor do contrato</p>
  } else if (!data) {
    content = <p className="text-xs text-gray-400 dark:text-gray-500">Carregando...</p>
  } else if (data.valor != null) {
    content = (
      <div className="space-y-1.5">
        <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(data.valor)}</p>
        {data.semValor > 0 && (
          <p className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            {data.semValor === 1 ? 'Uma venda fechada está' : `${data.semValor} vendas fechadas estão`} sem valor do contrato.
            O gestor comercial precisa informar no card do lead.
          </p>
        )}
      </div>
    )
  } else if (editing) {
    content = (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveManual() }}
            placeholder="0,00"
            aria-label="Valor do contrato"
            autoFocus
            className="min-w-0 flex-1 text-sm border border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white tabular-nums"
          />
          <button
            type="button"
            onClick={() => void saveManual()}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setSaveError(null) }}
            disabled={saving}
            className="px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
      </div>
    )
  } else if (data.manual) {
    content = (
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(data.manual.valor)}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Informado à mão{data.manual.por ? ` por ${data.manual.por}` : ''} em {formatDate(data.manual.em)}
          </p>
        </div>
        {canEditManual && (
          <button
            type="button"
            onClick={startEditing}
            title="Editar"
            aria-label="Editar valor do contrato"
            className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-blue-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        )}
      </div>
    )
  } else {
    content = (
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {data.vendas === 0
            ? 'Sem venda fechada no Comercial para este CNPJ.'
            : 'A venda fechada no Comercial está sem valor do contrato.'}
        </p>
        {canEditManual && (
          <button
            type="button"
            onClick={startEditing}
            className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            Informar valor do contrato
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1.5">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor do contrato</p>
      {content}
    </div>
  )
}
