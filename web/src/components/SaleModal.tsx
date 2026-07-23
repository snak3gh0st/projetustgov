'use client'

import { useState, useEffect, useRef } from 'react'
import { CRM_COMMISSIONS } from '@/lib/crm-catalog'

interface SaleModalProps {
  open: boolean
  leadNome: string
  currentTipoVendedor?: string | null
  userRole?: string | null
  isExclusivo?: boolean
  leadContratoAssinado?: boolean
  onConfirm: (data: { valor_venda: number; status_contato?: string; contrato_assinado?: boolean }) => void
  onCancel: () => void
}

export default function SaleModal({ open, leadNome, userRole, leadContratoAssinado, onConfirm, onCancel }: SaleModalProps) {
  const [valorStr, setValorStr] = useState('')
  const [error, setError] = useState('')
  const [contratoAssinado, setContratoAssinado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isVendedor = userRole === 'vendedor' || userRole === 'coordenador'
  const needsContratoConfirmation = !isVendedor && !leadContratoAssinado

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValorStr('')
      setError('')
      setContratoAssinado(false)
      // Focus input after a brief delay for animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

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
    if (needsContratoConfirmation && !contratoAssinado) {
      setError('Confirme que o contrato foi assinado antes de autorizar o fechamento')
      return
    }
    if (isVendedor) {
      onConfirm({ valor_venda: valor, status_contato: 'Em Aprovação' })
    } else {
      onConfirm({ valor_venda: valor, contrato_assinado: true })
    }
  }

  if (!open) return null

  // Compute preview commission
  const previewValor = parseCurrencyInput(valorStr) || 0
  const previewComissao = previewValor * (CRM_COMMISSIONS.CONSULTOR / 100)
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

          {/* Preview */}
          {previewValor > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Comissão Consultor ({CRM_COMMISSIONS.CONSULTOR}%)
                </span>
                <span className="text-[#0072F7] font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewComissao)}
                </span>
              </div>
              {!isVendedor && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Fundo Comercial (2%)</span>
                  <span className="text-green-600 dark:text-green-400 font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(previewFundoComercial)}
                  </span>
                </div>
              )}
              {isVendedor ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Lead seguirá para aprovação do gestor.</p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Venda pronta para confirmação final.</p>
              )}
            </div>
          )}

          {/* Contrato assinado gate */}
          {needsContratoConfirmation && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={contratoAssinado}
                onChange={e => {
                  setContratoAssinado(e.target.checked)
                  setError('')
                }}
                className="w-4 h-4 rounded border-gray-300"
              />
              Contrato assinado
            </label>
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
