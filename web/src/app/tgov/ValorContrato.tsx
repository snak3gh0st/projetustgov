'use client'

import { useEffect, useState } from 'react'
import { formatCurrencyFull } from '@/lib/format'

// ---------------------------------------------------------------------------
// ValorContrato — valor da venda fechada pelo Comercial para o CNPJ.
// Sem valor, avisa que o gestor comercial precisa informar no card do lead.
// ---------------------------------------------------------------------------

interface ValorContratoData {
  valor: number | null
  vendas: number
  semValor: number
}

export default function ValorContrato({ cnpj }: { cnpj: string | null }) {
  const [data, setData] = useState<ValorContratoData | null>(null)
  const [error, setError] = useState(false)
  const digits = (cnpj ?? '').replace(/\D/g, '')

  useEffect(() => {
    if (digits.length !== 14) return
    let cancelled = false
    setData(null)
    setError(false)
    fetch(`/api/tgov/valor-contrato?cnpj=${digits}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ValorContratoData>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [digits])

  if (digits.length !== 14) return null

  let content: React.ReactNode
  if (error) {
    content = <p className="text-xs text-red-500">Erro ao carregar o valor do contrato</p>
  } else if (!data) {
    content = <p className="text-xs text-gray-400 dark:text-gray-500">Carregando...</p>
  } else if (data.vendas === 0) {
    content = <p className="text-xs text-gray-500 dark:text-gray-400">Sem venda fechada no Comercial para este CNPJ.</p>
  } else {
    content = (
      <div className="space-y-1.5">
        {data.valor != null && (
          <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrencyFull(data.valor)}</p>
        )}
        {data.semValor > 0 && (
          <p className="rounded-md bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            {data.semValor === 1 ? 'Uma venda fechada está' : `${data.semValor} vendas fechadas estão`} sem valor do contrato.
            O gestor comercial precisa informar no card do lead.
          </p>
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
