'use client'

import { useState, useEffect, useRef } from 'react'

interface SaleModalProps {
  open: boolean
  leadNome: string
  currentTipoVendedor?: string | null
  userRole?: string | null
  isExclusivo?: boolean
  onConfirm: (data: { valor_venda: number; tipo_vendedor: string; status_contato?: string }) => void
  onCancel: () => void
}

export default function SaleModal({ open, leadNome, currentTipoVendedor, userRole, isExclusivo, onConfirm, onCancel }: SaleModalProps) {
  const [valorStr, setValorStr] = useState('')
  const [tipoVendedor, setTipoVendedor] = useState(currentTipoVendedor || 'SDR')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isVendedor = userRole === 'vendedor'
  const isGestorVendedor = userRole === 'gestor_vendedor'

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValorStr('')
      if (isExclusivo) {
        setTipoVendedor('Exclusivo')
      } else {
        setTipoVendedor(currentTipoVendedor || 'SDR')
      }
      setError('')
      // Focus input after a brief delay for animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, currentTipoVendedor, isExclusivo])

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
    // SDR → Closer flow: vendedor selects SDR, lead goes to Aguardando Closer
    if (isVendedor && tipoVendedor === 'SDR') {
      onConfirm({ valor_venda: valor, tipo_vendedor: 'SDR', status_contato: 'Aguardando Closer' })
    } else {
      onConfirm({ valor_venda: valor, tipo_vendedor: tipoVendedor })
    }
  }

  if (!open) return null

  // Compute preview commission
  const cleaned = valorStr.replace(/[^\d.,]/g, '').replace(',', '.')
  const previewValor = parseFloat(cleaned) || 0
  const pct = tipoVendedor === 'Closer' ? 4 : tipoVendedor === 'Exclusivo' ? 3 : 1
  const previewComissao = previewValor * (pct / 100)
  // For SDR → Closer flow: show split preview
  const isSdrCloserFlow = isVendedor && tipoVendedor === 'SDR'
  const closerPct = 3
  const previewCloserComissao = previewValor * (closerPct / 100)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white border border-gray-200 rounded-2xl shadow-lg w-[440px] max-w-[90vw] p-6 animate-fade-in">
        {/* Glow effect */}
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-green-500/5 to-transparent rounded-t-2xl pointer-events-none" />

        <div className="relative space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-heading font-bold text-gray-900">Registrar Venda</h2>
            <p className="text-sm text-gray-500 mt-1 truncate">{leadNome}</p>
          </div>

          {/* Valor da Venda */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
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
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500/50 transition-colors font-mono"
            />
            {error && (
              <p className="text-red-500 text-xs mt-1.5">{error}</p>
            )}
          </div>

          {/* Tipo Vendedor */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">
              Tipo de Vendedor *
            </label>
            {isExclusivo ? (
              <div className="px-4 py-3 rounded-xl text-sm font-semibold border bg-emerald-50 border-emerald-200 text-emerald-700">
                Exclusivo (3%)
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoVendedor('SDR')}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                    tipoVendedor === 'SDR'
                      ? 'bg-blue-50 border-blue-200 text-[#0072F7]'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {isVendedor ? 'SDR → Paulo Closer' : 'SDR (1%)'}
                </button>
                <button
                  type="button"
                  onClick={() => setTipoVendedor('Closer')}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                    tipoVendedor === 'Closer'
                      ? 'bg-purple-50 border-purple-200 text-purple-600'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  Closer (4%)
                </button>
              </div>
            )}
          </div>

          {/* Preview */}
          {previewValor > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
              {isSdrCloserFlow ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Sua comissao SDR (1%)</span>
                    <span className="text-[#0072F7] font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewComissao)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Paulo Closer (3%)</span>
                    <span className="text-purple-600 font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewCloserComissao)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Bonus por fechamento</span>
                    <span className="text-green-600 font-semibold">R$ 50</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">Lead sera enviado para Paulo fechar</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Comissao ({pct}%)</span>
                    <span className="text-[#0072F7] font-semibold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewComissao)}
                    </span>
                  </div>
                  {tipoVendedor !== 'Exclusivo' && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Bonus por fechamento</span>
                      <span className="text-green-600 font-semibold">R$ 50</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-sigma-navy-dark bg-green-500 hover:bg-green-400 transition-colors"
            >
              {isSdrCloserFlow ? 'Enviar para Closer' : 'Confirmar Venda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
