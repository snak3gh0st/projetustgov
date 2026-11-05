'use client'

import { useState } from 'react'

// Uma mensagem de WhatsApp: recebida à esquerda, enviada à direita, com origem, autor e status.
// Foto, áudio e vídeo aparecem no balão; documento vira um cartão que baixa.

export interface MensagemView {
  id: number
  direcao: 'recebida' | 'enviada'
  origem: 'contato' | 'projete' | 'celular'
  texto: string | null
  tipo: string
  midia: { mimetype?: string; fileName?: string; tamanho?: number; segundos?: number } | null
  status: 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou'
  enviada_em: string
  autor_nome: string | null
}

const TIPO_LABEL: Record<string, string> = { imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', outro: 'Mensagem' }
const STATUS_LABEL: Record<MensagemView['status'], string> = { enviando: 'Enviando', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Não enviada' }

function tamanho(bytes?: number): string | null {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

const duracao = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : null)

function IconeArquivo() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

/** Cartão de arquivo: nome e tamanho; baixa ao clicar (sem link quando a mensagem não saiu). */
function CartaoArquivo({ m, href }: { m: MensagemView; href: string | null }) {
  const nome = m.midia?.fileName || TIPO_LABEL[m.tipo] || 'Arquivo'
  const info = [tamanho(m.midia?.tamanho), href ? 'Baixar' : null].filter(Boolean).join(' · ')
  const corpo = (
    <>
      <IconeArquivo />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{nome}</span>
        {info && <span className="block text-xs text-ink-3">{info}</span>}
      </span>
    </>
  )
  const classe = 'mb-1 flex max-w-72 items-center gap-2.5 rounded-xl bg-raised/70 px-3 py-2 text-ink-2 ring-1 ring-inset ring-line'
  return href
    ? <a href={href} className={`${classe} transition-colors duration-fast hover:bg-raised`}>{corpo}</a>
    : <div className={classe}>{corpo}</div>
}

function Midia({ m }: { m: MensagemView }) {
  const [falhou, setFalhou] = useState(false)
  // Mensagem que não saiu não tem mídia no WhatsApp para buscar.
  if (m.status === 'falhou') return <CartaoArquivo m={m} href={null} />
  const baixar = `/api/whatsapp/midia/${m.id}`
  const ver = `${baixar}?ver=1`
  if (falhou) return <CartaoArquivo m={m} href={baixar} />
  if (m.tipo === 'imagem' || m.tipo === 'figurinha') {
    return (
      <a href={ver} target="_blank" rel="noopener noreferrer" className="mb-1 block" title="Abrir a foto">
        {/* eslint-disable-next-line @next/next/no-img-element -- mídia privada servida pela API, sem otimização do Next */}
        <img
          src={ver}
          alt={m.texto ? `Foto: ${m.texto}` : 'Foto recebida pelo WhatsApp'}
          loading="lazy"
          onError={() => setFalhou(true)}
          className={`rounded-xl bg-raised object-cover ${m.tipo === 'figurinha' ? 'h-28 w-28' : 'max-h-72 min-h-24 w-auto max-w-full'}`}
        />
      </a>
    )
  }
  if (m.tipo === 'audio') {
    return (
      <div className="mb-1 flex items-center gap-2">
        <audio controls preload="none" src={ver} onError={() => setFalhou(true)} className="h-10 w-64 max-w-full" />
        {duracao(m.midia?.segundos) && <span className="shrink-0 text-xs tabular-nums text-ink-3">{duracao(m.midia?.segundos)}</span>}
      </div>
    )
  }
  if (m.tipo === 'video') {
    return <video controls preload="none" src={ver} onError={() => setFalhou(true)} className="mb-1 max-h-72 w-full max-w-sm rounded-xl bg-black" />
  }
  return <CartaoArquivo m={m} href={baixar} />
}

export function MensagemBolha({ m, onRetry, compact }: { m: MensagemView; onRetry?: (texto: string) => void; compact?: boolean }) {
  const enviada = m.direcao === 'enviada'
  // Na janela de conversa o dia vem no separador; no card do lead, que mistura notas, vai junto.
  const hora = new Date(m.enviada_em).toLocaleString('pt-BR', {
    ...(compact ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
  const temMidia = m.tipo !== 'texto'
  return (
    <div className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${compact ? '' : 'sm:max-w-[70%]'} ${
          m.status === 'falhou'
            ? 'bg-red-50 text-red-900 ring-1 ring-inset ring-red-200 dark:bg-red-500/10 dark:text-red-200 dark:ring-red-500/30'
            : enviada
              ? 'bg-emerald-50 text-ink ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25'
              : 'bg-surface text-ink ring-1 ring-inset ring-line'
        }`}
      >
        {temMidia && <Midia m={m} />}
        {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
        <p className="mt-1 flex flex-wrap items-center justify-end gap-x-1.5 whitespace-nowrap text-[11px] leading-4 text-ink-3">
          {enviada && <span>{m.origem === 'celular' ? 'pelo celular' : m.autor_nome ?? 'PROJETE'}</span>}
          <time dateTime={m.enviada_em} className="tabular-nums">{hora}</time>
          {enviada && <span className={m.status === 'falhou' ? 'font-medium text-red-700 dark:text-red-300' : ''}>{STATUS_LABEL[m.status]}</span>}
        </p>
        {/* Só texto se reenvia daqui; arquivo e voz precisam ser escolhidos de novo. */}
        {m.status === 'falhou' && onRetry && m.texto && m.tipo === 'texto' && (
          <button type="button" onClick={() => onRetry(m.texto!)} className="mt-1 text-xs font-medium text-red-800 underline dark:text-red-200">Tentar de novo</button>
        )}
      </div>
    </div>
  )
}
