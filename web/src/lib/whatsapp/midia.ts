import type { MensagemTipo } from './webhook'

// Regras de mídia do WhatsApp: o que a página mostra na tela e como um arquivo enviado é classificado. Puro.

export const MAX_ARQUIVO = 16 * 1024 * 1024

const base = (mimetype: string) => mimetype.split(';')[0].trim().toLowerCase()

const FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VIDEO = ['video/mp4', 'video/3gpp', 'video/webm']

/** Pode abrir dentro da página. Qualquer outro tipo (HTML, SVG, PDF...) só baixa: rodaria no domínio do PROJETE. */
export function exibivel(mimetype: string): boolean {
  const b = base(mimetype)
  // Áudio sem "+xml": audio/x+xml o navegador abriria como documento XML.
  return FOTO.includes(b) || VIDEO.includes(b) || (/^audio\/[a-z0-9.-]+$/.test(b))
}

/**
 * Faixa de bytes pedida no cabeçalho Range (o Safari só toca áudio e vídeo assim). null: entregar o arquivo todo
 * (sem Range, várias faixas ou outra unidade); 'invalida': fora do arquivo (responder 416).
 */
export function faixaPedida(range: string | null, total: number): { inicio: number; fim: number } | null | 'invalida' {
  const m = range?.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (!m[1] && !m[2])) return null
  let inicio: number
  let fim: number
  if (!m[1]) {
    inicio = Math.max(0, total - Number(m[2]))
    fim = total - 1
  } else {
    inicio = Number(m[1])
    fim = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1
  }
  if (inicio >= total || inicio > fim) return 'invalida'
  return { inicio, fim }
}

type Classificado =
  | { ok: true; tipo: MensagemTipo; mediatype: 'image' | 'video' | 'document' | 'audio' }
  | { ok: false; erro: string }

/** Como o arquivo sai pelo WhatsApp. Foto e vídeo fora dos formatos que o WhatsApp mostra vão como documento. */
export function classificarArquivo(a: { tamanho: number; mimetype: string; voz: boolean }): Classificado {
  if (!(a.tamanho > 0)) return { ok: false, erro: 'O arquivo está vazio.' }
  if (a.tamanho > MAX_ARQUIVO) return { ok: false, erro: 'Envie arquivos de até 16 MB.' }
  if (a.voz) return { ok: true, tipo: 'audio', mediatype: 'audio' }
  const b = base(a.mimetype)
  if (['image/jpeg', 'image/png', 'image/webp'].includes(b)) return { ok: true, tipo: 'imagem', mediatype: 'image' }
  if (['video/mp4', 'video/3gpp'].includes(b)) return { ok: true, tipo: 'video', mediatype: 'video' }
  return { ok: true, tipo: 'documento', mediatype: 'document' }
}
