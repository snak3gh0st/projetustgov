'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { inputClass } from '@/components/leads/list-ui'

// Caixa de envio da conversa: texto, arquivo (clipe ou arrastar) com legenda, e mensagem de voz gravada no navegador.

const MAX_ARQUIVO = 16 * 1024 * 1024
const MAX_GRAVACAO_S = 5 * 60

export type EnviarArquivo = (arquivo: File, opts: { voz: boolean; legenda: string | null }) => Promise<boolean>

/** Formato que o navegador grava: ogg/opus (Firefox), webm/opus (Chrome), mp4 (Safari). O Evolution converte para voz do WhatsApp. */
function formatoGravacao(): { mimeType: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const [mimeType, ext] of [['audio/ogg;codecs=opus', 'ogg'], ['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a']] as const) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, ext }
  }
  return null
}

const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Icone({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}
const CLIPE = 'M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13'
const MICROFONE = 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z'
const LIXO = 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0'
const botaoIcone = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors duration-fast hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40'

export function Composer({ onSend, onSendArquivo, arquivoSolto, disabled }: {
  onSend: (texto: string) => Promise<boolean>
  onSendArquivo: EnviarArquivo
  /** Arquivo arrastado para a conversa. */
  arquivoSolto?: File | null
  disabled?: boolean
}) {
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gravação: o MediaRecorder e os pedaços ficam fora do estado (não redesenham a tela).
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [voz, setVoz] = useState<File | null>(null)
  const gravadorRef = useRef<{ rec: MediaRecorder; stream: MediaStream; pedacos: Blob[]; descartar: boolean } | null>(null)

  function escolher(f: File | null | undefined) {
    if (!f) return
    if (f.size === 0) { toast.error('O arquivo está vazio.'); return }
    if (f.size > MAX_ARQUIVO) { toast.error('Envie arquivos de até 16 MB.'); return }
    setArquivo(f)
  }
  useEffect(() => { escolher(arquivoSolto) }, [arquivoSolto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Miniatura da foto escolhida; o endereço temporário é liberado ao trocar ou enviar.
  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith('image/')) { setPrevia(null); return }
    const url = URL.createObjectURL(arquivo)
    setPrevia(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  useEffect(() => {
    if (!gravando) return
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [gravando])
  useEffect(() => { if (gravando && segundos >= MAX_GRAVACAO_S) parar(false) }, [gravando, segundos]) // eslint-disable-line react-hooks/exhaustive-deps
  // Saiu da conversa no meio da gravação: solta o microfone.
  useEffect(() => () => { gravadorRef.current?.stream.getTracks().forEach((t) => t.stop()) }, [])

  async function gravar() {
    const formato = formatoGravacao()
    if (!formato || !navigator.mediaDevices?.getUserMedia) { toast.error('Este navegador não grava áudio. Use o Chrome, o Edge ou o Safari.'); return }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast.error('Libere o microfone para o PROJETE no navegador e tente de novo.')
      return
    }
    const rec = new MediaRecorder(stream, { mimeType: formato.mimeType })
    const g = { rec, stream, pedacos: [] as Blob[], descartar: false }
    rec.ondataavailable = (e) => { if (e.data.size > 0) g.pedacos.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      gravadorRef.current = null
      setGravando(false)
      if (g.descartar || g.pedacos.length === 0) return
      const tipo = formato.mimeType.split(';')[0]
      setVoz(new File(g.pedacos, `voz.${formato.ext}`, { type: tipo }))
    }
    gravadorRef.current = g
    rec.start(1000)
    setSegundos(0)
    setVoz(null)
    setGravando(true)
  }

  function parar(descartar: boolean) {
    const g = gravadorRef.current
    if (!g) return
    g.descartar = descartar
    g.rec.stop()
  }

  async function enviar() {
    if (enviando) return
    if (voz) {
      setEnviando(true)
      const ok = await onSendArquivo(voz, { voz: true, legenda: null })
      setEnviando(false)
      if (ok) setVoz(null)
      return
    }
    if (arquivo) {
      setEnviando(true)
      const ok = await onSendArquivo(arquivo, { voz: false, legenda: texto.trim() || null })
      setEnviando(false)
      if (ok) { setArquivo(null); setTexto('') }
      return
    }
    const t = texto.trim()
    if (!t) return
    setEnviando(true)
    const ok = await onSend(t)
    setEnviando(false)
    if (ok) setTexto('')
  }

  if (gravando || voz) {
    return (
      <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-3" role="group" aria-label="Mensagem de voz">
        <button type="button" className={botaoIcone} onClick={() => (gravando ? parar(true) : setVoz(null))} aria-label="Descartar a gravação" title="Descartar">
          <Icone d={LIXO} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-ink">
          {gravando && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />}
          <span className="tabular-nums" aria-live="off">{relogio(segundos)}</span>
          <span className="truncate text-ink-3">{gravando ? `Gravando (até ${MAX_GRAVACAO_S / 60} minutos)` : 'Pronta para enviar'}</span>
        </div>
        {gravando
          ? <Button type="button" variant="secondary" onClick={() => parar(false)}>Parar</Button>
          : <Button type="button" variant="primary" disabled={enviando} onClick={() => void enviar()}>{enviando ? 'Enviando...' : 'Enviar voz'}</Button>}
      </div>
    )
  }

  return (
    <form className="border-t border-line bg-surface px-3 py-3" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
      {arquivo && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-raised px-3 py-2">
          {previa
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) do arquivo escolhido
            ? <img src={previa} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-3 ring-1 ring-line"><Icone d={CLIPE} /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{arquivo.name}</p>
            <p className="text-xs text-ink-3">{arquivo.size < 1024 * 1024 ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB` : `${(arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`}</p>
          </div>
          <button type="button" className={botaoIcone} onClick={() => setArquivo(null)} aria-label="Tirar o arquivo" title="Tirar o arquivo">
            <Icone d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input ref={inputRef} type="file" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" className={botaoIcone} disabled={disabled || enviando} onClick={() => inputRef.current?.click()} aria-label="Anexar foto, vídeo ou documento" title="Anexar">
          <Icone d={CLIPE} />
        </button>
        <textarea
          aria-label={arquivo ? 'Legenda do arquivo' : 'Mensagem de WhatsApp'}
          rows={1}
          value={texto}
          disabled={disabled}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
          placeholder={disabled ? 'Você só pode consultar esta conversa.' : arquivo ? 'Legenda (opcional)' : 'Escreva uma mensagem. Enter envia, Shift+Enter quebra a linha.'}
          className={`${inputClass} max-h-40 min-h-10 flex-1 resize-y`}
        />
        {!arquivo && !texto.trim() ? (
          <button type="button" className={botaoIcone} disabled={disabled} onClick={() => void gravar()} aria-label="Gravar mensagem de voz" title="Gravar voz">
            <Icone d={MICROFONE} />
          </button>
        ) : (
          <Button type="submit" variant="primary" disabled={disabled || enviando}>{enviando ? 'Enviando...' : 'Enviar'}</Button>
        )}
      </div>
    </form>
  )
}
