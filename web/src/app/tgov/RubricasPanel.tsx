'use client'

import { Fragment, useEffect, useState } from 'react'
import { formatCurrencyFull, parseCurrencyInput } from '@/lib/format'
import { totalLinha, totalRubricas, type Rubrica } from '@/lib/rubricas'

// ---------------------------------------------------------------------------
// RubricasPanel — linhas de cargo/meses/valor da proposta.
// mode="edit": time de Aprovação adiciona, edita (caneta) e exclui (X); cada
// ação grava na hora e a linha volta a ser só texto. mode="total": Execução só vê.
// ---------------------------------------------------------------------------

interface LinhaForm {
  cargo: string
  meses: string
  valor: string
}

// 'new' = linha sendo adicionada; número = índice da linha salva em edição.
type Editing = { index: number | 'new'; form: LinhaForm } | null

const EMPTY_FORM: LinhaForm = { cargo: '', meses: '', valor: '' }

function toForm(r: Rubrica): LinhaForm {
  return {
    cargo: r.cargo,
    meses: String(r.meses),
    valor: r.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }
}

// Valor que não dá para ler fica NaN (não zero): o salvar avisa em vez de gravar 0.
function toRubrica(f: LinhaForm): Rubrica {
  return { cargo: f.cargo.trim(), meses: Number(f.meses), valorUnitario: parseCurrencyInput(f.valor) }
}

function validate(r: Rubrica): string | null {
  if (!r.cargo) return 'Informe o cargo'
  if (!Number.isInteger(r.meses) || r.meses < 1) return 'Informe os meses (número inteiro)'
  if (!Number.isFinite(r.valorUnitario) || r.valorUnitario < 0) return 'Informe o valor unitário (ex.: 1.500,00)'
  return null
}

const inputClass =
  'w-full text-sm border border-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

const iconButtonClass = 'flex-shrink-0 p-1 rounded text-gray-400 transition-colors disabled:opacity-40'

function RubricaLinha({ r, actions }: { r: Rubrica; actions?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="min-w-0 text-gray-700 dark:text-gray-300 [overflow-wrap:anywhere]">
        {r.cargo}
        <span className="text-gray-400 dark:text-gray-500">
          {' · '}{r.meses} {r.meses === 1 ? 'mês' : 'meses'} × {formatCurrencyFull(r.valorUnitario)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(totalLinha(r))}</span>
        {actions}
      </span>
    </li>
  )
}

export default function RubricasPanel({ nrProposta, mode }: { nrProposta: string; mode: 'edit' | 'total' }) {
  const [saved, setSaved] = useState<Rubrica[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setEditing(null)
    fetch(`/api/tgov/rubricas?nr_proposta=${encodeURIComponent(nrProposta)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ linhas: Rubrica[]; canEdit: boolean }>
      })
      .then((data) => {
        if (cancelled) return
        setSaved(data.linhas)
        setCanEdit(data.canEdit)
      })
      .catch(() => { if (!cancelled) setLoadError('Erro ao carregar rubricas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [nrProposta])

  const editable = mode === 'edit' && canEdit
  const total = totalRubricas(saved)

  // Grava a lista inteira; quem chama só fecha o formulário se o servidor aceitou.
  async function persist(linhas: Rubrica[]): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tgov/rubricas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nr_proposta: nrProposta, linhas }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSaved(data.linhas)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveForm() {
    if (!editing) return
    const linha = toRubrica(editing.form)
    const invalid = validate(linha)
    if (invalid) {
      setError(invalid)
      return
    }
    const next = editing.index === 'new'
      ? [...saved, linha]
      : saved.map((r, i) => (i === editing.index ? linha : r))
    if (await persist(next)) setEditing(null)
  }

  async function remove(index: number) {
    await persist(saved.filter((_, i) => i !== index))
  }

  function startEditing(index: number | 'new') {
    setError(null)
    setEditing({ index, form: index === 'new' ? EMPTY_FORM : toForm(saved[index]) })
  }

  function updateForm(patch: Partial<LinhaForm>) {
    setEditing((prev) => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev))
  }

  const form = editing && (
    <li className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-white dark:bg-gray-900 p-2.5 my-1.5 space-y-2">
      <input
        type="text"
        value={editing.form.cargo}
        onChange={(e) => updateForm({ cargo: e.target.value })}
        placeholder="Cargo"
        aria-label="Cargo"
        autoFocus
        className={inputClass}
      />
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
        <label className="text-[11px] text-gray-500 dark:text-gray-400">
          Meses
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={editing.form.meses}
            onChange={(e) => updateForm({ meses: e.target.value })}
            className={`${inputClass} mt-0.5`}
          />
        </label>
        <label className="text-[11px] text-gray-500 dark:text-gray-400">
          Valor unitário
          <input
            type="text"
            inputMode="decimal"
            value={editing.form.valor}
            onChange={(e) => updateForm({ valor: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveForm() }}
            placeholder="0,00"
            className={`${inputClass} mt-0.5 tabular-nums`}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void saveForm()}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setError(null) }}
            disabled={saving}
            className="px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(totalLinha(toRubrica(editing.form)))}</span>
        </p>
      </div>
    </li>
  )

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

      {!loading && !loadError && (
        <>
          {saved.length === 0 && editing === null && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {mode === 'edit' ? 'Nenhuma rubrica cadastrada.' : 'Nenhuma rubrica cadastrada pela Aprovação.'}
            </p>
          )}

          {(saved.length > 0 || editing) && (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {saved.map((r, i) => (
                editing?.index === i ? (
                  <Fragment key={i}>{form}</Fragment>
                ) : (
                  <RubricaLinha
                    key={i}
                    r={r}
                    actions={editable && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditing(i)}
                          disabled={saving || editing !== null}
                          title="Editar"
                          aria-label={`Editar ${r.cargo}`}
                          className={`${iconButtonClass} hover:text-blue-600`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(i)}
                          disabled={saving || editing !== null}
                          title="Excluir"
                          aria-label={`Excluir ${r.cargo}`}
                          className={`${iconButtonClass} hover:text-red-500`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </>
                    )}
                  />
                )
              ))}
              {editing?.index === 'new' && form}
            </ul>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {editable && editing === null && (
            <button
              type="button"
              onClick={() => startEditing('new')}
              disabled={saving}
              className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
            >
              + Adicionar linha
            </button>
          )}
        </>
      )}
    </div>
  )
}
