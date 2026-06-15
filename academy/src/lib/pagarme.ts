// Pagar.me v5 API client
// Split: SIGMA 1% | Instructor 70% | Academy 29%

const BASE = 'https://api.pagar.me/core/v5'

export const SPLIT = {
  sigma: 0.01,      // 1%
  instructor: 0.70, // 70%
  academy: 0.29,    // 29%
} as const

function headers() {
  const key = process.env.PAGARME_SECRET_KEY
  if (!key) throw new Error('PAGARME_SECRET_KEY not set')
  return {
    'Authorization': `Basic ${Buffer.from(key + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Pagar.me ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json as T
}

export type PagarmeRecipient = { id: string; name: string; email: string; status: string }

export async function createRecipient(data: {
  name: string
  email: string
  document: string
  type: 'individual' | 'company'
  pixKey?: string
  bankCode?: string
  agency?: string
  account?: string
  accountType?: 'checking' | 'savings'
}): Promise<PagarmeRecipient> {
  const defaultSettlement = data.pixKey
    ? { type: 'pix', pix_key: data.pixKey }
    : {
        type: 'bank_account',
        bank_account: {
          holder_name: data.name,
          holder_type: data.type,
          holder_document: data.document,
          bank: data.bankCode,
          branch_number: data.agency,
          account_number: data.account,
          type: data.accountType ?? 'checking',
        },
      }

  return req('POST', '/recipients', {
    name: data.name,
    email: data.email,
    document: data.document,
    type: data.type,
    default_bank_account: data.pixKey ? undefined : defaultSettlement,
    transfer_settings: { transfer_enabled: true, transfer_interval: 'daily', transfer_day: 0 },
    metadata: {},
  })
}

export type CheckoutResult = {
  orderId: string
  chargeId: string
  status: string
  pixQrCode?: string
  pixQrCodeUrl?: string
  pixExpiresAt?: string
  boletoUrl?: string
  boletoBarcode?: string
  boletoExpiresAt?: string
}

export async function createOrder(opts: {
  amountCents: number
  method: 'pix' | 'boleto' | 'credit_card'
  customer: { name: string; email: string; document: string; phone?: string }
  productName: string
  sigmaRecipientId: string
  instructorRecipientId: string
  academyRecipientId: string
  cardToken?: string
  installments?: number
  softDescriptor?: string
}): Promise<CheckoutResult> {
  const amt = opts.amountCents
  const sigmaAmt = Math.round(amt * SPLIT.sigma)
  const instructorAmt = Math.round(amt * SPLIT.instructor)
  const academyAmt = amt - sigmaAmt - instructorAmt

  const splits = [
    { recipient_id: opts.sigmaRecipientId, amount: sigmaAmt, type: 'flat', options: { charge_processing_fee: true, liable: true, charge_remainder: false } },
    { recipient_id: opts.instructorRecipientId, amount: instructorAmt, type: 'flat', options: { charge_processing_fee: false, liable: false, charge_remainder: false } },
    { recipient_id: opts.academyRecipientId, amount: academyAmt, type: 'flat', options: { charge_processing_fee: false, liable: false, charge_remainder: true } },
  ]

  const paymentConfig =
    opts.method === 'pix'
      ? { payment_method: 'pix', pix: { expires_in: 3600 }, split: splits }
      : opts.method === 'boleto'
      ? { payment_method: 'boleto', boleto: { instructions: opts.productName, due_at: new Date(Date.now() + 3 * 86400000).toISOString() }, split: splits }
      : { payment_method: 'credit_card', credit_card: { installments: opts.installments ?? 1, statement_descriptor: opts.softDescriptor ?? 'PROJETUS', card_token: opts.cardToken }, split: splits }

  const order: Record<string, unknown> = await req('POST', '/orders', {
    items: [{ amount: amt, description: opts.productName, quantity: 1, code: 'COURSE' }],
    customer: {
      name: opts.customer.name,
      email: opts.customer.email,
      type: 'individual',
      document: opts.customer.document,
      phones: opts.customer.phone ? { mobile_phone: { country_code: '55', area_code: opts.customer.phone.slice(0, 2), number: opts.customer.phone.slice(2) } } : undefined,
    },
    payments: [paymentConfig],
    metadata: {},
  })

  const charge = (order.charges as Record<string, unknown>[])?.[0] ?? {}
  const lastTx = (charge.last_transaction as Record<string, unknown>) ?? {}

  return {
    orderId: order.id as string,
    chargeId: charge.id as string,
    status: order.status as string,
    pixQrCode: lastTx.qr_code as string | undefined,
    pixQrCodeUrl: lastTx.qr_code_url as string | undefined,
    pixExpiresAt: lastTx.expires_at as string | undefined,
    boletoUrl: lastTx.url as string | undefined,
    boletoBarcode: lastTx.line as string | undefined,
    boletoExpiresAt: (charge as Record<string, unknown>).due_at as string | undefined,
  }
}
