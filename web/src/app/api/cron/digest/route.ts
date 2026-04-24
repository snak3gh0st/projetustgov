import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getNotificationsForUser } from '@/lib/digest-email'
import { digestEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TGOV_ROLES = ['adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao', 'gestor', 'admin']

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Dynamic import to avoid build errors when resend is not yet installed
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromEmail = process.env.DIGEST_FROM_EMAIL || 'Projetus <noreply@projetus.org>'

    // Get all opted-in TGov users
    const users = await query<{
      id: string
      nome: string
      email: string
      role: string
    }>(
      `SELECT id, nome, email, role FROM users
       WHERE email_digest = true AND active = true
       AND role = ANY($1::text[])`,
      [TGOV_ROLES]
    )

    let sent = 0
    let skipped = 0

    for (const user of users) {
      const data = await getNotificationsForUser(user.id, user.role)

      if (data.items.length === 0 && data.stale.length === 0) {
        skipped++
        continue
      }

      const appUrl = process.env.NEXTAUTH_URL || 'https://projetus.vercel.app'
      const { subject, html } = digestEmail({ nome: user.nome, items: data.items, stale: data.stale, appUrl })

      const { data: sendData, error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: user.email,
        subject,
        html,
      })

      if (sendError) {
        console.error(`[cron/digest] resend error for ${user.email}:`, JSON.stringify(sendError))
        skipped++
        continue
      }

      console.log(`[cron/digest] queued id=${sendData?.id} to=${user.email}`)
      sent++
    }

    console.log(`[cron/digest] sent=${sent} skipped=${skipped} total=${users.length}`)
    return NextResponse.json({ sent, skipped, total: users.length })
  } catch (error) {
    console.error('[cron/digest] error:', error)
    return NextResponse.json({ error: 'Digest cron failed' }, { status: 500 })
  }
}
