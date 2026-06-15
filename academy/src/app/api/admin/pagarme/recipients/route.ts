import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAdminSession } from '@/lib/auth'
import { query } from '@/lib/db'
import { ok, err } from '@/lib/http'
import { createRecipient } from '@/lib/pagarme'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  productSlug: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  document: z.string().min(11).max(14),
  type: z.enum(['individual', 'company']).default('individual'),
  pixKey: z.string().optional(),
  bankCode: z.string().optional(),
  agency: z.string().optional(),
  account: z.string().optional(),
  accountType: z.enum(['checking', 'savings']).default('checking'),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const body = bodySchema.safeParse(await req.json())
  if (!body.success) return err(400, 'Dados inválidos')

  const { productSlug, ...recipientData } = body.data

  const productRows = await query(
    `SELECT id FROM education_products WHERE slug = $1 LIMIT 1`,
    [productSlug]
  )
  const product = (productRows as Record<string, unknown>[])[0]
  if (!product) return err(404, 'Produto não encontrado')

  let pagarmeRecipient
  try {
    pagarmeRecipient = await createRecipient(recipientData)
  } catch (e) {
    return err(502, 'Erro ao criar recipient no Pagar.me: ' + (e as Error).message)
  }

  await query(
    `INSERT INTO pagarme_recipients
       (product_id, pagarme_recipient_id, name, email, document,
        bank_code, agency, account, account_type, pix_key, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
     ON CONFLICT (pagarme_recipient_id) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()`,
    [
      product.id,
      pagarmeRecipient.id,
      recipientData.name,
      recipientData.email,
      recipientData.document,
      recipientData.bankCode ?? null,
      recipientData.agency ?? null,
      recipientData.account ?? null,
      recipientData.accountType,
      recipientData.pixKey ?? null,
    ]
  )

  return ok({ recipientId: pagarmeRecipient.id, status: pagarmeRecipient.status })
}

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Não autorizado')

  const rows = await query(
    `SELECT r.id, r.pagarme_recipient_id, r.name, r.email, r.pix_key, r.status,
            p.slug AS product_slug, p.title AS product_title
     FROM pagarme_recipients r
     LEFT JOIN education_products p ON p.id = r.product_id
     ORDER BY r.created_at DESC`
  )
  return ok({ recipients: rows })
}
