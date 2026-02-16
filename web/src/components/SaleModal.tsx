'use client'

import { useState, useEffect, useRef } from 'react'

interface SaleModalProps {
  open: boolean
  leadNome: string
  currentTipoVendedor?: string | null
  onConfirm: (data: { valor_venda: number; tipo_vendedor: string }) => void
  onCancel: () => void
}

export default function SaleModal({ open, leadNome, currentTipoVendedor, onConfirm, onCancel }: SaleModalProps) {
  const [valorStr, setValorStr] = useState('')
  const [tipoVendedor, setTipoVendedor] = useState(currentTipoVendedor || 'SDR')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValorStr('')
      setTipoVendedor(currentTipoVendedor || 'SDR')
      setError('')
      // Focus input after a brief delay for animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, currentTipoVendedor])

  // Handle escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  function handleSubmit() {
    setError('')
    const cleaned = valorStr.replace(/[^\d.,]/g, '').replace(',', '.')
    const valor = parseFloat(cleaned)
    if (!cleaned || isNaN(valor) || valor <= 0) {
      setError('Informe um valor de venda valido (maior que zero)')
      return
    }
    onConfirm({ valor_venda: valor, tipo_vendedor: tipoVendedor })
  }

  if (!open) return null

  // Compute preview commission
  const cleaned = valorStr.replace(/[^\d.,]/g, '').replace(',', '.')
  const previewValor = parseFloat(cleaned) || 0
  const pct = tipoVendedor === 'Closer' ? 4 : 1
  const previewComissao = previewValor * (pct / 100)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-sigma-navy-card border border-white/10 rounded-2xl shadow-2xl w-[440px] max-w-[90vw] p-6 animate-fade-in">
        {/* Glow effect */}
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-green-500/10 to-transparent rounded-t-2xl pointer-events-none" />

        <div className="relative space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-heading font-bold text-white">Registrar Venda</h2>
            <p className="text-sm text-gray-400 mt-1 truncate">{leadNome}</p>
          </div>

          {/* Valor da Venda */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Valor da Venda (R$) *
            </label>
            <input
              ref={inputRef}
              type="text"
              value={valorStr}
              onChange={e => {
                setValorStr(e.target.value)
                setError('')
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSubmit()
              }}
              placeholder="Ex: 400000"
              className="w-full bg-sigma-navy-light border border-white/10 rounded-xl px-4 py-3 text-lg text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors font-mono"
            />
            {error && (
              <p className="text-red-400 text-xs mt-1.5">{error}</p>
            )}
          </div>

          {/* Tipo Vendedor */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
              Tipo de Vendedor *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipoVendedor('SDR')}
                className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                  tipoVendedor === 'SDR'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                SDR (1%)
              </button>
              <button
                type="button"
                onClick={() => setTipoVendedor('Closer')}
                className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                  tipoVendedor === 'Closer'
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                Closer (4%)
              </button>
            </div>
          </div>

          {/* Preview */}
          {previewValor > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Comissao ({pct}%)</span>
                <span className="text-sigma-neon font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewComissao)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Bonus por fechamento</span>
                <span className="text-green-400 font-semibold">R$ 50</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 border border-white/10 hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-sigma-navy-dark bg-green-500 hover:bg-green-400 transition-colors"
            >
              Confirmar Venda
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
