import { NextResponse } from 'next/server'
import { seesAllConversations } from '@/lib/whatsapp/access'
import { whatsappGuard } from '@/lib/whatsapp/api'
import { connectionState, currentQr, ensureInstanceAndQr } from '@/lib/whatsapp/evolution'

import { whatsappChannels } from '@/lib/whatsapp/channels'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/conexao - estado do número (gestão)
export async function GET(request: Request) {
  const guard = await whatsappGuard(request)
  if (guard instanceof NextResponse) return guard
  if (!seesAllConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const estado = await connectionState(5_000, guard.cfg)
  return NextResponse.json({ estado, instancia: guard.cfg.instance, canal: guard.cfg.channel,
    qrBase64: estado === 'conectando' ? currentQr(guard.cfg.instance) : null,
    canais: whatsappChannels().map((c) => ({ id: c.channel, nome: c.label })),
  })
}

// POST /api/whatsapp/conexao - prepara a instância e devolve o QR enquanto não estiver conectado
export async function POST(request: Request) {
  const guard = await whatsappGuard(request)
  if (guard instanceof NextResponse) return guard
  if (!seesAllConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (guard.cfg.channel !== 'qr') return NextResponse.json({ error: 'O número oficial é conectado pela configuração da Meta.' }, { status: 409 })
  const appUrl = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  if (!appUrl) return NextResponse.json({ error: 'NEXTAUTH_URL não configurada' }, { status: 500 })
  try {
    return NextResponse.json(await ensureInstanceAndQr(`${appUrl}/api/whatsapp/webhook`, guard.cfg))
  } catch (error) {
    console.error('[api/whatsapp/conexao] falhou:', error)
    return NextResponse.json({ error: 'Não foi possível falar com o serviço do WhatsApp.' }, { status: 502 })
  }
}
