import { NextResponse } from 'next/server'
import { seesAllConversations } from '@/lib/whatsapp/access'
import { whatsappGuard } from '@/lib/whatsapp/api'
import { connectionState, ensureInstanceAndQr } from '@/lib/whatsapp/evolution'

export const dynamic = 'force-dynamic'

// GET /api/whatsapp/conexao - estado do número (gestão)
export async function GET() {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  if (!seesAllConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ estado: await connectionState(), instancia: guard.cfg.instance })
}

// POST /api/whatsapp/conexao - prepara a instância e devolve o QR enquanto não estiver conectado
export async function POST() {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  if (!seesAllConversations(guard.session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const appUrl = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '')
  if (!appUrl) return NextResponse.json({ error: 'NEXTAUTH_URL não configurada' }, { status: 500 })
  try {
    return NextResponse.json(await ensureInstanceAndQr(`${appUrl}/api/whatsapp/webhook`))
  } catch (error) {
    console.error('[api/whatsapp/conexao] falhou:', error)
    return NextResponse.json({ error: 'Não foi possível falar com o serviço do WhatsApp.' }, { status: 502 })
  }
}
