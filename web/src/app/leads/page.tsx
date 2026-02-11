'use client'

import { useState, useEffect, useCallback } from 'react'
import LeadTable from '@/components/LeadTable'
import type { Lead } from '@/lib/types'

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [estados, setEstados] = useState<string[]>([])
  const [naturezas, setNaturezas] = useState<string[]>([])
  const [naturezaJuridica, setNaturezaJuridica] = useState('')
  const [semContato, setSemContato] = useState(false)
  const [minEmendas, setMinEmendas] = useState('')
  const [maxPropostas, setMaxPropostas] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/filters/estados').then((r) => r.json()),
      fetch('/api/filters/natureza-juridica').then((r) => r.json()),
    ]).then(([e, n]) => {
      setEstados(Array.isArray(e) ? e : [])
      setNaturezas(Array.isArray(n) ? n : [])
    })
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (estado) params.set('estado', estado)
    if (naturezaJuridica) params.set('natureza_juridica', naturezaJuridica)
    if (semContato) params.set('sem_contato', 'true')
    if (minEmendas) params.set('min_emendas', minEmendas)
    if (maxPropostas) params.set('max_propostas', maxPropostas)
    params.set('limit', '500')

    try {
      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [search, estado, naturezaJuridica, semContato, minEmendas, maxPropostas])

  useEffect(() => {
    const timer = setTimeout(fetchLeads, 300)
    return () => clearTimeout(timer)
  }, [fetchLeads])

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="font-heading text-2xl font-bold text-white">Lista de Leads</h1>
        <p className="text-sm text-gray-400 mt-1">Pesquise e filtre leads qualificados</p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar por CNPJ ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-sigma-navy-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon/50 transition-colors"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50"
        >
          <option value="">Todos UFs</option>
          {estados.map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>

        <select
          value={naturezaJuridica}
          onChange={(e) => setNaturezaJuridica(e.target.value)}
          className="bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50"
        >
          <option value="">Todas Naturezas</option>
          {naturezas.map((nj) => (
            <option key={nj} value={nj}>{nj}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Max propostas"
          value={maxPropostas}
          onChange={(e) => setMaxPropostas(e.target.value)}
          className="w-32 bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50"
        />

        <input
          type="number"
          placeholder="Min emendas"
          value={minEmendas}
          onChange={(e) => setMinEmendas(e.target.value)}
          className="w-32 bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-sigma-neon/50"
        />

        <label className="flex items-center gap-2 bg-sigma-navy-card border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={semContato}
            onChange={(e) => setSemContato(e.target.checked)}
            className="rounded"
          />
          Sem contato
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-gray-500">Carregando leads...</div>
        </div>
      ) : (
        <LeadTable data={leads} />
      )}
    </div>
  )
}
