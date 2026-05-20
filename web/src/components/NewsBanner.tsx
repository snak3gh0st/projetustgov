'use client'

import { useState, useEffect } from 'react'

const NEWS_VERSION = 'v4.8'
const NEWS_ITEMS = [
  'UI: tema escuro completo em todas as paginas',
  'UI: tema escuro disponivel em toda a plataforma (botao no menu lateral)',
  'UI: menu lateral pode ser recolhido para liberar espaco — preferencia salva entre sessoes',
  'UI: navegacao mobile com gaveta inferior (toque no botao azul no canto inferior esquerdo)',
  'UI: assinatura "Hub da PROJETUS" no lugar de "CRM de Vendas"',
]
const STORAGE_KEY = `projetus-news-dismissed-v4.8`

export default function NewsBanner() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== 'true') {
      setDismissed(false)
    }
  }, [])

  if (dismissed) return null

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="bg-gradient-to-r from-[#FD225C]/5 via-[#7A4BAC]/5 to-[#0072F7]/5 border border-[#7A4BAC]/20 rounded-lg p-4 mb-6 relative">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label="novidades">
            &#9733;
          </span>
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">
            Novidades &mdash; {NEWS_VERSION}
          </h3>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors"
          aria-label="Fechar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
      <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
        {NEWS_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        Projetus CRM {NEWS_VERSION} &mdash; SigmaIntel
      </p>
    </div>
  )
}
