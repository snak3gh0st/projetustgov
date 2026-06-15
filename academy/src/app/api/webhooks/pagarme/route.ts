import { NextRequest } from 'next/server'
import { query, withTransaction } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Validates Pagar.me HMAC-SHA256 signature
async function validateSignature(body: string, header: string | null): Promise<boolean> {
  const secret = process.env.PAGARME_WEBHOOK_SECRET
  if (!secret || !header) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Buffer.from(sig).toString('hex')
  return expected === header
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('x-pagarme-signature')

  if (!await validateSignature(body, sig)) {
    return new Response('Invalid signature', { status: 400 })
  }

  let event: Record<string, unknown>
  try { event = JSON.parse(body) } catch { return new Response('Invalid JSON', { status: 400 }) }

  const eventId = event.id as string
  const eventType = event.type as string

  // Idempotency guard
  const already = await query(
    `SELECT 1 FROM pagarme_webhook_events WHERE pagarme_event_id = $1 LIMIT 1`,
    [eventId]
  ).catch(() => [])
  if ((already as unknown[]).length > 0) return new Response('{"ok":true,"dup":true}', { status: 200 })

  await query(
    `INSERT INTO pagarme_webhook_events (pagarme_event_id, event_type, payload) VALUES ($1,$2,$3)`,
    [eventId, eventType, JSON.stringify(event)]
  ).catch(() => {})

  // Handle payment confirmed
  if (eventType === 'order.paid') {
    const data = event.data as Record<string, unknown>
    const orderId = data.id as string

    await withTransaction(async (client) => {
      // Update order status
      const orderRows = await client.query(
        `UPDATE pagarme_orders SET status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE pagarme_order_id = $1
         RETURNING product_id, learner_email, learner_name`,
        [orderId]
      )
      const order = orderRows.rows[0]
      if (!order) return

      // Check if already enrolled
      const existing = await client.query(
        `SELECT id FROM education_enrollments WHERE product_id = $1 AND learner_email = $2 LIMIT 1`,
        [order.product_id, order.learner_email]
      )
      if (existing.rows.length > 0) {
        // Re-activate if revoked/expired
        await client.query(
          `UPDATE education_enrollments SET status = 'active', enrolled_at = COALESCE(enrolled_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [existing.rows[0].id]
        )
        return
      }

      // Create enrollment
      await client.query(
        `INSERT INTO education_enrollments
           (product_id, learner_email, learner_name, status, enrolled_at, access_starts_at)
         VALUES ($1, $2, $3, 'active', NOW(), NOW())`,
        [order.product_id, order.learner_email, order.learner_name]
      )
    })
  }

  if (eventType === 'order.canceled' || eventType === 'charge.refunded') {
    const data = event.data as Record<string, unknown>
    const orderId = (eventType === 'order.canceled' ? data.id : (data.order as Record<string, unknown>)?.id) as string
    if (orderId) {
      await query(
        `UPDATE pagarme_orders SET status = $1, canceled_at = NOW(), updated_at = NOW()
         WHERE pagarme_order_id = $2`,
        [eventType === 'charge.refunded' ? 'refunded' : 'canceled', orderId]
      ).catch(() => {})
    }
  }

  await query(
    `UPDATE pagarme_webhook_events SET processed_at = NOW() WHERE pagarme_event_id = $1`,
    [eventId]
  ).catch(() => {})

  return new Response('{"ok":true}', { status: 200 })
}
