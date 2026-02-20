import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

// POST: send a push notification to all users watching a given CNPJ
// Auth: accepts internal calls via x-internal-key header OR authenticated session
export async function POST(request: NextRequest) {
  // Allow internal server-to-server calls via x-internal-key header
  const internalKey = request.headers.get('x-internal-key')
  const isInternalCall = internalKey && internalKey === process.env.INTERNAL_API_KEY

  if (!isInternalCall) {
    // Fallback: allow authenticated sessions
    const session = await getApiSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: { cnpj?: string; title?: string; body?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { cnpj, title, body: notifBody } = body
  if (!cnpj) {
    return NextResponse.json({ error: 'cnpj is required' }, { status: 400 })
  }

  // Configure VAPID details
  const vapidEmail = process.env.VAPID_EMAIL
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }

  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)

  // Get all subscriptions for users watching this CNPJ
  const subscriptions = await query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN cnpj_monitorado cm ON cm.user_id = ps.user_id
     WHERE cm.cnpj = $1`,
    [cnpj]
  )

  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0 })
  }

  const payload = JSON.stringify({
    title: title || 'Projetus — CNPJ Monitorado',
    body: notifBody || `CNPJ ${cnpj} recebeu atualização de emenda`,
    url: '/monitorar',
  })

  let sent = 0
  let failed = 0
  const expiredEndpoints: string[] = []

  for (const sub of subscriptions as { id: number; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
      sent++
    } catch (err: unknown) {
      const pushErr = err as { statusCode?: number }
      // 410 Gone or 404 means the subscription has expired — remove it
      if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint)
      }
      failed++
    }
  }

  // Clean up expired subscriptions
  for (const endpoint of expiredEndpoints) {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]).catch(() => {})
  }

  return NextResponse.json({ sent, failed })
}
