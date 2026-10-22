'use client'

// Uma mensagem de WhatsApp: recebida à esquerda, enviada à direita, com origem, autor e status.

export interface MensagemView {
  id: number
  direcao: 'recebida' | 'enviada'
  origem: 'contato' | 'projete' | 'celular'
  texto: string | null
  tipo: string
  midia: { mimetype?: string; fileName?: string } | null
  status: 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou'
  enviada_em: string
  autor_nome: string | null
}

const TIPO_LABEL: Record<string, string> = { imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', outro: 'Mensagem' }
const STATUS_LABEL: Record<MensagemView['status'], string> = { enviando: 'Enviando', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Não enviada' }

export function MensagemBolha({ m, onRetry, compact }: { m: MensagemView; onRetry?: (texto: string) => void; compact?: boolean }) {
  const enviada = m.direcao === 'enviada'
  const hora = new Date(m.enviada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const temMidia = m.tipo !== 'texto'
  return (
    <div className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${compact ? '' : 'sm:max-w-[70%]'} ${
          m.status === 'falhou'
            ? 'bg-red-50 text-red-900 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30'
            : enviada
              ? 'bg-emerald-50 text-ink ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25'
              : 'bg-surface text-ink ring-1 ring-inset ring-line'
        }`}
      >
        {temMidia && (
          <a href={`/api/whatsapp/midia/${m.id}`} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Baixar {m.midia?.fileName || TIPO_LABEL[m.tipo] || 'arquivo'}
          </a>
        )}
        {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
        <p className="mt-1 flex flex-wrap items-center justify-end gap-x-1.5 text-[11px] text-ink-3">
          {enviada && <span>{m.origem === 'celular' ? 'pelo celular' : m.autor_nome ?? 'PROJETE'}</span>}
          <time dateTime={m.enviada_em}>{hora}</time>
          {enviada && <span className={m.status === 'falhou' ? 'font-medium text-red-700 dark:text-red-300' : ''}>{STATUS_LABEL[m.status]}</span>}
        </p>
        {m.status === 'falhou' && onRetry && m.texto && (
          <button type="button" onClick={() => onRetry(m.texto!)} className="mt-1 text-xs font-medium text-red-800 underline dark:text-red-200">Tentar de novo</button>
        )}
      </div>
    </div>
  )
}
