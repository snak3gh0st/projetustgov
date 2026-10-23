import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'
import { mediaBase64 } from '@/lib/whatsapp/evolution'
import { exibivel } from '@/lib/whatsapp/midia'

export const dynamic = 'force-dynamic'

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'text/plain': 'txt' }

// GET /api/whatsapp/midia/[mensagemId][?ver=1] - baixa a mídia (busca no Evolution na hora); ?ver=1 mostra foto, áudio e vídeo na página
export async function GET(request: Request, { params }: { params: { mensagemId: string } }) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  const id = Number(params.mensagemId)
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [msg] = await query<{ conversa_id: number; wa_id: string; tipo: string; midia: { fileName?: string } | null }>(
    `SELECT conversa_id, wa_id, tipo, midia FROM whatsapp_mensagens WHERE id = $1`,
    [id]
  )
  if (!msg || !(await conversaVisivel(msg.conversa_id, guard.session, guard.cfg))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const { base64, mimetype } = await mediaBase64(msg.wa_id)
    const base = mimetype.split(';')[0]
    const nome = msg.midia?.fileName || `whatsapp-${msg.tipo}.${EXT[base] ?? (base.startsWith('audio/') ? 'ogg' : 'bin')}`
    // Na página só foto, áudio e vídeo; o resto (HTML, SVG, PDF...) sempre baixa.
    const naPagina = new URL(request.url).searchParams.get('ver') === '1' && exibivel(base)
    return new NextResponse(Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64'), {
      headers: {
        'Content-Type': base,
        // filename em ASCII para navegadores antigos; filename* leva o nome com acentos.
        'Content-Disposition': `${naPagina ? 'inline' : 'attachment'}; filename="${nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
        // A mídia de uma mensagem não muda: o navegador guarda por um dia e não busca no Evolution de novo.
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (error) {
    console.error('[api/whatsapp/midia] falhou:', error)
    return NextResponse.json({ error: 'Não foi possível baixar a mídia.' }, { status: 502 })
  }
}
