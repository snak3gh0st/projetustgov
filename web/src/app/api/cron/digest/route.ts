import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCommercialTgovUpdatesForUser, getNotificationsForUser } from '@/lib/digest-email'
import { digestEmail } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TGOV_ROLES = [
  'adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista',
  'coord_execucao', 'assistente_execucao', 'coord_prestacao', 'assistente_prestacao',
  'gestor', 'admin',
]

const CRM_DIGEST_ROLES = ['vendedor', 'coordenador', 'visualizador', 'gestor', 'admin']

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
    const appUrl = process.env.NEXTAUTH_URL || 'https://projetus.vercel.app'

    // Opted-in users across TGov + commercial roles
    const users = await query<{
      id: string
      nome: string
      email: string
      role: string
    }>(
      `SELECT id, nome, email, role FROM users
       WHERE email_digest = true AND active = true
       AND role = ANY($1::text[])`,
      [[...TGOV_ROLES, ...CRM_DIGEST_ROLES].filter((r, i, arr) => arr.indexOf(r) === i)]
    )

    let sent = 0
    let skipped = 0

    for (const user of users) {
      const isTgov = TGOV_ROLES.includes(user.role)
      const isCrm = CRM_DIGEST_ROLES.includes(user.role)

      const tgovData = isTgov
        ? await getNotificationsForUser(user.id, user.role)
        : { items: [], stale: [] }

      const crmData = isCrm
        ? await getCommercialTgovUpdatesForUser(user.id)
        : { items: [], stale: [] }

      // Merge items (dedupe by proposta key + eventAt)
      const seen = new Set<string>()
      const items = [...tgovData.items, ...crmData.items].filter((item) => {
        const key = `${item.propostaKey}|${item.eventAt}|${item.eventType}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      const stale = tgovData.stale

      if (items.length === 0 && stale.length === 0) {
        skipped++
        continue
      }

      const { subject, html } = digestEmail({ nome: user.nome, items, stale, appUrl })

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
