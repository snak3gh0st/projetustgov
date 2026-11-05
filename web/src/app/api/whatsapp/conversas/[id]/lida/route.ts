import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { conversaVisivel, whatsappGuard } from '@/lib/whatsapp/api'

export const dynamic = 'force-dynamic'

// POST /api/whatsapp/conversas/[id]/lida - zera as não lidas ao abrir a conversa
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const guard = await whatsappGuard()
  if (guard instanceof NextResponse) return guard
  const conversa = await conversaVisivel(Number(params.id), guard.session, guard.cfg)
  if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await query(`UPDATE whatsapp_conversas SET nao_lidas = 0 WHERE id = $1`, [conversa.id])
  return NextResponse.json({ ok: true })
}
