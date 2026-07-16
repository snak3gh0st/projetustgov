'use client'

import { useState, useEffect, useRef } from 'react'
import { CRM_COMMISSIONS, normalizeTipoVendedor } from '@/lib/crm-catalog'

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
  const isCoordenador = userRole === 'coordenador'
  void isCoordenador // coordenador uses same logic as gestor (can close directly)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValorStr('')
      if (isExclusivo) {
        setTipoVendedor('In-Sites Sells')
      } else {
        setTipoVendedor(normalizeTipoVendedor(currentTipoVendedor))
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

  function parseCurrencyInput(raw: string): number {
    const trimmed = raw.trim()
    if (!trimmed) return NaN
    const digitsOnly = trimmed.replace(/\D/g, '')
    if (!digitsOnly) return NaN

    const hasComma = trimmed.includes(',')
    const hasDot = trimmed.includes('.')

    if (hasComma && hasDot) {
      // pt-BR thousand separators + decimal comma (e.g. 95.500,25)
      return Number(trimmed.replace(/\./g, '').replace(',', '.'))
    }
    if (hasComma) {
      // decimal comma (e.g. 95500,50)
      return Number(trimmed.replace(',', '.'))
    }
    if (hasDot) {
      const parts = trimmed.split('.')
      const maybeThousands = parts.length > 1 && parts.every((p, i) => (i === 0 ? p.length >= 1 : p.length === 3))
      if (maybeThousands) {
        // thousand separators only (e.g. 95.500)
        return Number(trimmed.replace(/\./g, ''))
      }
    }
    return Number(trimmed)
  }

  function handleSubmit() {
    setError('')
    const valor = parseCurrencyInput(valorStr)
    if (isNaN(valor) || valor <= 0) {
      setError('Informe um valor de venda valido (maior que zero)')
      return
    }
    if (isVendedor) {
      onConfirm({ valor_venda: valor, tipo_vendedor: tipoVendedor, status_contato: 'Em Aprovação' })
    } else {
      onConfirm({ valor_venda: valor, tipo_vendedor: tipoVendedor })
    }
  }

  if (!open) return null

  // Compute preview commission
  const previewValor = parseCurrencyInput(valorStr) || 0
  const pct = tipoVendedor === 'Closer'
    ? CRM_COMMISSIONS.GESTOR
    : tipoVendedor === 'In-Sites Sells'
      ? CRM_COMMISSIONS.IN_SITES_SELLS
      : CRM_COMMISSIONS.CONSULTOR
  const previewComissao = previewValor * (pct / 100)
  const previewFundoComercial = previewValor * (CRM_COMMISSIONS.FUNDO_COMERCIAL / 100)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg w-[440px] max-w-[90vw] p-6 animate-fade-in">
        {/* Glow effect */}
        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-green-500/5 to-transparent rounded-t-2xl pointer-events-none" />

        <div className="relative space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100">Registrar Venda</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{leadNome}</p>
          </div>

          {/* Valor da Venda */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
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
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-green-500/50 transition-colors font-mono"
            />
            {error && (
              <p className="text-red-500 text-xs mt-1.5">{error}</p>
            )}
          </div>

          {/* Tipo Vendedor */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Tipo de Vendedor *
            </label>
            {isExclusivo ? (
              <div className="px-4 py-3 rounded-xl text-sm font-semibold border bg-emerald-50 border-emerald-200 text-emerald-700">
                In-Sites Sells (5%)
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoVendedor('SDR')}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                    tipoVendedor === 'SDR'
                      ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-[#0072F7]'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {isVendedor ? 'Consultor' : 'Consultor (5%)'}
                </button>
                <button
                  type="button"
                  onClick={() => setTipoVendedor('Closer')}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                    tipoVendedor === 'Closer'
                      ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-400'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  >
                  Gestor (3%)
                </button>
              </div>
            )}
          </div>

          {/* Preview */}
          {previewValor > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Comissão {tipoVendedor === 'Closer' ? 'Gestor' : 'Consultor'} ({pct}%)
                </span>
                <span className="text-[#0072F7] font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewComissao)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Fundo Comercial (2%)</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewFundoComercial)}
                </span>
              </div>
              {isVendedor ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Lead seguirá para aprovação do gestor.</p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Venda pronta para confirmação final.</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-sigma-navy-dark bg-green-500 hover:bg-green-400 transition-colors"
            >
              {isVendedor ? 'Enviar para Aprovação' : 'Confirmar Venda'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
