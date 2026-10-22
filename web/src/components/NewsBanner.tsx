'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, m } from 'motion/react'

// Ao publicar mudanças visíveis: adicione um release no topo (versão nova + itens).
const NEWS_RELEASES: { version: string; items: string[] }[] = [
  {
    version: 'v1.13',
    items: [
      'WhatsApp das consultorias no PROJETE: a página Conversas recebe e responde as mensagens do número das consultorias',
      'No card do lead, as mensagens aparecem na linha do tempo e a caixa embaixo envia nota ou WhatsApp',
      'Meu dia mostra quem está esperando sua resposta, e mensagem no WhatsApp conta como contato',
      'A gestão direciona conversas, liga cada uma ao lead certo e conecta o número pela página Conexão do WhatsApp',
    ],
  },
  {
    version: 'v1.12',
    items: [
      'Para a diretoria: Visão geral com Comercial, Operação TransfereGov, Financeiro e CSM numa tela só',
      'Cada área com os números principais e o atalho para o BI dela',
    ],
  },
  {
    version: 'v1.11',
    items: [
      'Card do lead novo: notas e movimentações numa linha do tempo só, com a caixa de nota embaixo',
      'Emendas, convênios, reunião e contatos na coluna da direita, cada emenda com o próprio status',
      'Editar uma nota voltou a funcionar',
    ],
  },
  {
    version: 'v1.10',
    items: [
      'Meu dia: o consultor abre o PROJETE com os leads novos, os parados e as reuniões marcadas',
      'Cada item mostra o funil (Aprovação, Execução ou Prestação de Contas) e abre o card do lead',
      'O Pipeline do consultor continua no menu, logo abaixo do Meu dia',
    ],
  },
  {
    version: 'v1.9',
    items: [
      'CSM passa a fazer parte da área Comercial e sai da Operação TransfereGov',
    ],
  },
  {
    version: 'v1.8',
    items: [
      'Visualizador consulta os leads sem alterar status, contatos ou observações',
      'Só a gestão desfaz uma venda fechada',
      'Aba Operação da área CSM voltou a carregar, em modo consulta',
    ],
  },
  {
    version: 'v1.7',
    items: [
      'Leads numa página só, com abas Aprovação, Execução e Prestação de Contas',
      'Lista e painel lateral com o visual novo e avisos claros quando algo não salva',
      'Comissão aparece só para quem tem permissão de vê-la',
    ],
  },
  {
    version: 'v1.6',
    items: [
      'Menu organizado por área: cada equipe vê só o que é do seu trabalho',
      'Diretoria com acesso a todas as áreas e ao BI de cada uma',
      'Gestor comercial com a área Comercial completa e a gestão da própria equipe',
    ],
  },
  {
    version: 'v1.5',
    items: [
      'Visual renovado: cores, tipografia e espaçamento unificados em todo o app',
      'Pipeline: funil em uma linha só, com as etapas em sequência e os desfechos separados',
      'Animações suaves para abas, painéis, números e novas movimentações',
      'Novidades e notificações agora ficam na barra do topo',
    ],
  },
  {
    version: 'v1.4',
    items: [
      'Prestação de Contas: novo funil comercial e lista de leads (menu "Leads de prestação de contas"), com o mesmo status da Execução',
      'Execução: lista e funil mostram só convênios em execução; correção das contagens por status no Pipeline',
    ],
  },
  {
    version: 'v1.3',
    items: [
      'Pipeline: Atividade Recente mostra as movimentações reais e atualiza a cada minuto',
      'Lead: histórico de movimentação com data e horário (status e atribuição)',
      'Distribuição: vendas fechadas sem dono podem ser redistribuídas; a comissão vai junto e fica registrada no histórico',
      'Pipeline: tela inicial mais enxuta (comissão visível só para o gestor)',
    ],
  },
]

const CURRENT = NEWS_RELEASES[0]
const STORAGE_KEY = `projete-news-dismissed-${CURRENT.version}`

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export default function NewsBanner() {
  const [dismissed, setDismissed] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  function handleDismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {}
    setDismissed(true)
  }

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <m.section
          key="news"
          aria-label={`Novidades ${CURRENT.version}`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-5 rounded-xl border border-accent/20 bg-accent-soft/60 dark:bg-accent-soft/40">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="inline-flex h-6 items-center rounded-md bg-accent px-2 text-xs font-semibold text-white tabular">
                {CURRENT.version}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-ink">
                <span className="font-medium">Novidades</span>
                <span className="hidden text-ink-2 sm:inline">: {CURRENT.items[0]}</span>
              </p>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-accent/10"
              >
                {expanded ? 'Fechar' : `Ver ${CURRENT.items.length}`}<span className="hidden sm:inline">{expanded ? ' lista' : ' novidades'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dispensar novidades"
                className="shrink-0 rounded-md p-1.5 text-ink-3 transition-colors duration-fast hover:bg-accent/10 hover:text-ink"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <AnimatePresence initial={false}>
              {expanded && (
                <m.div
                  key="list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-1.5 border-t border-accent/15 px-4 py-3 text-sm text-ink-2">
                    {CURRENT.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </m.section>
      )}
    </AnimatePresence>
  )
}
