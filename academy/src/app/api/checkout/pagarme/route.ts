import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { query, withTransaction } from '@/lib/db'
import { ok, err } from '@/lib/http'
import { createOrder, SPLIT } from '@/lib/pagarme'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  productSlug: z.string().min(1),
  method: z.enum(['pix', 'boleto', 'credit_card']),
  document: z.string().min(11).max(14),
  phone: z.string().optional(),
  cardToken: z.string().optional(),
  installments: z.number().int().min(1).max(12).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return err(401, 'Não autorizado')

  const body = bodySchema.safeParse(await req.json())
  if (!body.success) return err(400, 'Dados inválidos')

  const { productSlug, method, document, phone, cardToken, installments } = body.data

  // Load product + recipient config
  const rows = await query(
    `SELECT p.id, p.title, p.default_price_cents, p.currency,
            r.pagarme_recipient_id AS instructor_recipient_id
     FROM education_products p
     LEFT JOIN pagarme_recipients r ON r.product_id = p.id AND r.status = 'active'
     WHERE p.slug = $1 AND p.status = 'published'
     LIMIT 1`,
    [productSlug]
  )

  const product = (rows as Record<string, unknown>[])[0]
  if (!product) return err(404, 'Produto não encontrado')
  if (!product.default_price_cents) return err(400, 'Produto sem preço configurado')

  const sigmaRecipientId = process.env.PAGARME_SIGMA_RECIPIENT_ID
  const academyRecipientId = process.env.PAGARME_ACADEMY_RECIPIENT_ID
  if (!sigmaRecipientId || !academyRecipientId) return err(500, 'Configuração de recipients incompleta')

  if (!product.instructor_recipient_id) return err(400, 'Instrutor não configurado para recebimento')

  const amountCents = product.default_price_cents as number
  const sigmaAmt = Math.round(amountCents * SPLIT.sigma)
  const instructorAmt = Math.round(amountCents * SPLIT.instructor)
  const academyAmt = amountCents - sigmaAmt - instructorAmt

  // Learner info from session
  const learnerRows = await query(
    `SELECT name, email FROM learners WHERE id = $1 LIMIT 1`,
    [session.sub]
  )
  const learner = (learnerRows as Record<string, unknown>[])[0]
  if (!learner) return err(404, 'Aluno não encontrado')

  let checkout
  try {
    checkout = await createOrder({
      amountCents,
      method,
      customer: {
        name: learner.name as string,
        email: learner.email as string,
        document,
        phone,
      },
      productName: product.title as string,
      sigmaRecipientId,
      instructorRecipientId: product.instructor_recipient_id as string,
      academyRecipientId,
      cardToken,
      installments,
      softDescriptor: 'PROJETUS',
    })
  } catch (e) {
    return err(502, 'Erro ao criar ordem no Pagar.me: ' + (e as Error).message)
  }

  // Persist order
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO pagarme_orders
         (product_id, learner_email, learner_name, learner_document,
          pagarme_order_id, pagarme_charge_id, payment_method,
          amount_cents, sigma_amount_cents, instructor_amount_cents, academy_amount_cents,
          status, pix_qr_code, pix_qr_code_url, pix_expires_at,
          boleto_url, boleto_barcode, boleto_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        product.id,
        learner.email,
        learner.name,
        document,
        checkout.orderId,
        checkout.chargeId,
        method,
        amountCents,
        sigmaAmt,
        instructorAmt,
        academyAmt,
        checkout.status,
        checkout.pixQrCode ?? null,
        checkout.pixQrCodeUrl ?? null,
        checkout.pixExpiresAt ?? null,
        checkout.boletoUrl ?? null,
        checkout.boletoBarcode ?? null,
        checkout.boletoExpiresAt ?? null,
      ]
    )
  })

  return ok({
    orderId: checkout.orderId,
    status: checkout.status,
    method,
    amount: amountCents,
    pix: checkout.pixQrCode ? { qrCode: checkout.pixQrCode, qrCodeUrl: checkout.pixQrCodeUrl, expiresAt: checkout.pixExpiresAt } : null,
    boleto: checkout.boletoUrl ? { url: checkout.boletoUrl, barcode: checkout.boletoBarcode, expiresAt: checkout.boletoExpiresAt } : null,
  })
}
