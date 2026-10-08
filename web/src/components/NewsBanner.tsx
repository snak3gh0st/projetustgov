'use client'

import { useState, useEffect } from 'react'

const NEWS_VERSION = 'v1.1'
const NEWS_ITEMS = [
  'Financeiro: nova área BI Financeiro com dados do Conta Azul (caixa, resultado, pagar e receber, clientes e CRM)',
  'Financeiro: sincronização diária às 05:00 e botão Sincronizar agora',
  'CRM: novos status no funil — Contatado e Reunião Agendada',
  'CRM: status pós-venda Impedimento Técnico e Cancelado',
  'CRM: tag de tipo de serviço (Aprovação / Execução / Prestação de Contas) ao fechar venda',
  'Operacional: valor da venda fechada e tipo de serviço agora visíveis em Execução',
  'Comercial: aviso por e-mail quando a etapa no TransfereGov muda para leads seus',
  'Lead: botão "Agendar" abre o Google Calendar/Meet direto do contato',
  'CSM: nova área de extração — baixe a base de clientes por cidade (Brasília, Goiânia) em CSV',
  'UI: tema escuro completo em todas as paginas',
  'UI: tema escuro disponivel em toda a plataforma (botao no menu lateral)',
  'UI: menu lateral pode ser recolhido para liberar espaco — preferencia salva entre sessoes',
  'UI: navegacao mobile com gaveta inferior (toque no botao azul no canto inferior esquerdo)',
  'UI: nova identidade da Central da Mobilização',
]
const STORAGE_KEY = `central-mobilizacao-news-dismissed-${NEWS_VERSION}`

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
    <div className="bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 mb-6 relative">
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
        Central da Mobilização {NEWS_VERSION} &mdash; BTerminal Systems
      </p>
    </div>
  )
}
