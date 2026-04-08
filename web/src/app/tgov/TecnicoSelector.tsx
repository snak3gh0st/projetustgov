'use client'

import { useState } from 'react'

export type Tecnico = {
  id: string
  nome: string
  email?: string | null
  role: string
}

type Props = {
  targetType: 'proposta' | 'execucao'
  targetKey: string
  currentTecnicoId: string | null | undefined
  currentTecnicoNome: string | null | undefined
  tecnicos: Tecnico[]
  currentUserRole: string
  onAssigned: (tecnicoId: string | null, tecnicoNome: string | null) => void
}

const WRITE_ROLES = ['gestor', 'admin', 'adm_produto']
function canWriteTgovClient(role: string): boolean {
  return WRITE_ROLES.includes(role)
}

export default function TecnicoSelector({
  targetType,
  targetKey,
  currentTecnicoId,
  currentTecnicoNome,
  tecnicos,
  currentUserRole,
  onAssigned,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(currentTecnicoId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = !canWriteTgovClient(currentUserRole)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    const previous = selectedId
    setSelectedId(value)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tgov/tecnico', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_key: targetKey,
          tecnico_id: value || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const picked = tecnicos.find((t) => t.id === value) || null
      onAssigned(value || null, picked ? picked.nome : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atribuir técnico')
      setSelectedId(previous)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-1">
      <select
        value={selectedId}
        onChange={handleChange}
        disabled={disabled || saving}
        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
        title={disabled ? 'Apenas gestores podem alterar' : undefined}
      >
        <option value="">— Não atribuído —</option>
        {tecnicos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome} ({t.role})
          </option>
        ))}
        {/* Fallback: ensure currently-assigned técnico shows even if not in pool */}
        {currentTecnicoId && !tecnicos.some((t) => t.id === currentTecnicoId) && (
          <option value={currentTecnicoId}>
            {currentTecnicoNome || currentTecnicoId} (atual)
          </option>
        )}
      </select>
      {disabled && (
        <p className="text-[10px] text-gray-400 italic">
          Apenas gestores podem alterar
        </p>
      )}
      {saving && <p className="text-[10px] text-gray-500">Salvando...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
