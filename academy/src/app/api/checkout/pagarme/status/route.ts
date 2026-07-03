import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return err(400, 'orderId é obrigatório')

  const rows = await query<{
    status: string
    payment_method: string
    pix_qr_code: string | null
    pix_qr_code_url: string | null
    pix_expires_at: string | null
    boleto_url: string | null
    boleto_barcode: string | null
    boleto_expires_at: string | null
  }>(
    `SELECT status, payment_method, pix_qr_code, pix_qr_code_url, pix_expires_at,
            boleto_url, boleto_barcode, boleto_expires_at
     FROM pagarme_orders
     WHERE pagarme_order_id = $1 AND learner_email = $2
     LIMIT 1`,
    [orderId, session.email]
  )

  const order = rows[0]
  if (!order) return err(404, 'Pedido não encontrado')

  return ok({
    status: order.status,
    method: order.payment_method,
    pix: order.pix_qr_code
      ? { qrCode: order.pix_qr_code, qrCodeUrl: order.pix_qr_code_url, expiresAt: order.pix_expires_at }
      : null,
    boleto: order.boleto_url
      ? { url: order.boleto_url, barcode: order.boleto_barcode, expiresAt: order.boleto_expires_at }
      : null,
  })
}
