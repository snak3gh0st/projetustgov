'use client'

import { useState, useEffect } from 'react'
import { formatCNPJ } from '@/lib/format'

interface Vendedor {
  id: string
  nome: string
  lead_count: number
}

interface LeadAssignmentModalProps {
  cnpj: string | null
  leadNome: string | null
  currentVendedor: string | null
  onClose: () => void
  onAssigned: () => void
}

export default function LeadAssignmentModal({
  cnpj,
  leadNome,
  currentVendedor,
  onClose,
  onAssigned
}: LeadAssignmentModalProps) {
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [selectedVendedor, setSelectedVendedor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [forceAssign, setForceAssign] = useState(false)

  useEffect(() => {
    if (!cnpj) return
    // Fetch vendedores list
    fetch('/api/vendedores')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setVendedores(data)
      })
      .catch(() => setError('Erro ao carregar vendedores'))
  }, [cnpj])

  async function handleAssign() {
    if (!cnpj || !selectedVendedor) return

    setLoading(true)
    setError('')
    setDuplicateWarning(null)

    try {
      const res = await fetch('/api/leads/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj,
          vendedor_id: selectedVendedor,
          force: forceAssign
        })
      })

      const data = await res.json()

      if (res.status === 409 && !forceAssign) {
        // Duplicate assignment warning (LEAD-02)
        setDuplicateWarning(data.message)
        setForceAssign(true)
        setLoading(false)
        return
      }

      if (!res.ok) {
        setError(data.error || 'Erro ao atribuir lead')
        setLoading(false)
        return
      }

      // Success
      onAssigned()
      onClose()
    } catch (err) {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  if (!cnpj) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-sigma-navy-card border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-heading font-bold text-white mb-1">Atribuir Lead</h2>
        <p className="text-sm text-gray-400 mb-4">
          {leadNome} <span className="text-gray-600">({formatCNPJ(cnpj)})</span>
        </p>

        {currentVendedor && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-400">
            Atualmente atribuído a: <strong>{currentVendedor}</strong>
          </div>
        )}

        {duplicateWarning && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-400 mb-2">{duplicateWarning}</p>
            <p className="text-xs text-gray-500">Clique novamente para confirmar reatribuição</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <label className="block mb-4">
          <span className="text-sm text-gray-400 mb-2 block">Vendedor</span>
          <select
            value={selectedVendedor}
            onChange={e => setSelectedVendedor(e.target.value)}
            className="w-full bg-sigma-navy-light border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sigma-neon/50"
          >
            <option value="">Selecione...</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>
                {v.nome} ({v.lead_count} leads)
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedVendedor || loading}
            className="flex-1 px-4 py-2 rounded-lg bg-sigma-neon text-sigma-navy-dark font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Atribuindo...' : forceAssign ? 'Confirmar' : 'Atribuir'}
          </button>
        </div>
      </div>
    </div>
  )
}
