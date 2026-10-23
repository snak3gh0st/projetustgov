'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrencyFull, parseCurrencyInput } from '@/lib/format'
import { totalLinha, totalRubricas, type Rubrica } from '@/lib/rubricas'

// ---------------------------------------------------------------------------
// RubricasPanel — linhas de cargo/meses/valor da proposta.
// mode="edit": time de Aprovação adiciona e edita. mode="total": Execução só vê.
// ---------------------------------------------------------------------------

interface LinhaForm {
  key: number
  cargo: string
  meses: string
  valor: string
}

let nextKey = 1

function toForm(r: Rubrica): LinhaForm {
  return {
    key: nextKey++,
    cargo: r.cargo,
    meses: String(r.meses),
    valor: r.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }
}

function emptyLinha(): LinhaForm {
  return { key: nextKey++, cargo: '', meses: '', valor: '' }
}

// Valor que não dá para ler fica NaN (não zero): o salvar avisa em vez de gravar 0.
function toRubrica(l: LinhaForm): Rubrica {
  return {
    cargo: l.cargo.trim(),
    meses: Number(l.meses),
    valorUnitario: parseCurrencyInput(l.valor),
  }
}

function firstInvalidValor(linhas: Rubrica[]): number {
  return linhas.findIndex((r) => !Number.isFinite(r.valorUnitario) || r.valorUnitario < 0)
}

const inputClass =
  'w-full text-sm border border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

export default function RubricasPanel({ nrProposta, mode }: { nrProposta: string; mode: 'edit' | 'total' }) {
  const [linhas, setLinhas] = useState<LinhaForm[]>([])
  const [saved, setSaved] = useState<Rubrica[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetch(`/api/tgov/rubricas?nr_proposta=${encodeURIComponent(nrProposta)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ linhas: Rubrica[]; canEdit: boolean }>
      })
      .then((data) => {
        if (cancelled) return
        setSaved(data.linhas)
        setLinhas(data.linhas.map(toForm))
        setCanEdit(data.canEdit)
      })
      .catch(() => { if (!cancelled) setLoadError('Erro ao carregar rubricas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [nrProposta])

  const editable = mode === 'edit' && canEdit
  const atuais = useMemo(() => linhas.map(toRubrica), [linhas])
  const total = editable ? totalRubricas(atuais) : totalRubricas(saved)
  const dirty = JSON.stringify(atuais) !== JSON.stringify(saved)

  function update(key: number, patch: Partial<LinhaForm>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    const invalid = firstInvalidValor(atuais)
    if (invalid >= 0) {
      setSaveError(`Linha ${invalid + 1}: informe o valor unitário (ex.: 1.500,00)`)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/tgov/rubricas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nr_proposta: nrProposta, linhas: atuais }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSaved(data.linhas)
      setLinhas(data.linhas.map(toForm))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {mode === 'edit' ? 'Rubricas' : 'Rubricas da Aprovação'}
        </p>
        {!loading && !loadError && (
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{formatCurrencyFull(total)}</p>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400 dark:text-gray-500">Carregando...</p>}
      {loadError && <p className="text-xs text-red-500">{loadError}</p>}

      {!loading && !loadError && !editable && (
        saved.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {mode === 'edit' ? 'Nenhuma rubrica cadastrada.' : 'Nenhuma rubrica cadastrada pela Aprovação.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {saved.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                <span className="min-w-0 text-gray-700 dark:text-gray-300 [overflow-wrap:anywhere]">
                  {r.cargo}
                  <span className="text-gray-400 dark:text-gray-500">
                    {' · '}{r.meses} {r.meses === 1 ? 'mês' : 'meses'} × {formatCurrencyFull(r.valorUnitario)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(totalLinha(r))}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {!loading && !loadError && editable && (
        <>
          {linhas.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Nenhuma rubrica cadastrada.</p>}
          <ul className="space-y-2">
            {linhas.map((l, i) => (
              <li key={l.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={l.cargo}
                    onChange={(e) => update(l.key, { cargo: e.target.value })}
                    placeholder="Cargo"
                    aria-label={`Cargo da linha ${i + 1}`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setLinhas((prev) => prev.filter((x) => x.key !== l.key))}
                    title="Remover linha"
                    aria-label={`Remover linha ${i + 1}`}
                    className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    Meses
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={l.meses}
                      onChange={(e) => update(l.key, { meses: e.target.value })}
                      className={`${inputClass} mt-0.5`}
                    />
                  </label>
                  <label className="text-[11px] text-gray-500 dark:text-gray-400">
                    Valor unitário
                    <input
                      type="text"
                      inputMode="decimal"
                      value={l.valor}
                      onChange={(e) => update(l.key, { valor: e.target.value })}
                      placeholder="0,00"
                      className={`${inputClass} mt-0.5 tabular-nums`}
                    />
                  </label>
                </div>
                <p className="text-right text-xs text-gray-500 dark:text-gray-400">
                  Total <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(totalLinha(atuais[i]))}</span>
                </p>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setLinhas((prev) => [...prev, emptyLinha()])}
            className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Adicionar linha
          </button>

          <div className="flex items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              {savedFlash && <span className="text-xs text-green-600 dark:text-green-400 font-medium">Salvo!</span>}
              {saveError && <span className="text-xs text-red-600 dark:text-red-400">{saveError}</span>}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(total)}</span>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
