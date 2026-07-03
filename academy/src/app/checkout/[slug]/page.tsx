'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Product = {
  id: string
  slug: string
  title: string
  default_price_cents: number | null
}

type Method = 'pix' | 'boleto' | 'credit_card'

type PixResult = { qrCode: string; qrCodeUrl: string | null; expiresAt: string | null }
type BoletoResult = { url: string; barcode: string; expiresAt: string | null }

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function priceLabel(cents: number | null) {
  if (!cents || cents <= 0) return 'Gratuito'
  return `R$ ${(cents / 100).toFixed(2)}`
}

async function tokenizeCard(card: {
  number: string
  holderName: string
  holderDocument: string
  expMonth: string
  expYear: string
  cvv: string
}): Promise<string> {
  const publicKey = process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY
  if (!publicKey) throw new Error('Chave pública do Pagar.me não configurada')

  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: card.number,
        holder_name: card.holderName,
        holder_document: card.holderDocument,
        exp_month: card.expMonth,
        exp_year: card.expYear,
        cvv: card.cvv,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Cartão inválido')
  return data.id as string
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const [product, setProduct] = useState<Product | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(true)
  const [method, setMethod] = useState<Method>('pix')
  const [document, setDocumentValue] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [pix, setPix] = useState<PixResult | null>(null)
  const [boleto, setBoleto] = useState<BoletoResult | null>(null)
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpMonth, setCardExpMonth] = useState('')
  const [cardExpYear, setCardExpYear] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [installments, setInstallments] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const redirectedRef = useRef(false)

  useEffect(() => {
    fetch('/api/public/courses')
      .then(r => r.json())
      .then(d => {
        const found = (d.data ?? []).find((c: Product) => c.slug === slug)
        setProduct(found ?? null)
      })
      .finally(() => setLoadingProduct(false))
  }, [slug])

  const startPolling = useCallback((id: string) => {
    pollRef.current = setInterval(async () => {
      if (redirectedRef.current) return
      const res = await fetch(`/api/checkout/pagarme/status?orderId=${id}`)
      if (!res.ok) return
      const { data } = await res.json()
      if (data.status === 'paid' && !redirectedRef.current) {
        redirectedRef.current = true
        if (pollRef.current) clearInterval(pollRef.current)
        router.push('/area')
      }
    }, 4000)
  }, [router])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      let cardToken: string | undefined
      if (method === 'credit_card') {
        cardToken = await tokenizeCard({
          number: onlyDigits(cardNumber),
          holderName: cardHolder,
          holderDocument: onlyDigits(document),
          expMonth: cardExpMonth,
          expYear: cardExpYear,
          cvv: cardCvv,
        })
      }

      const res = await fetch('/api/checkout/pagarme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: slug,
          method,
          document: onlyDigits(document),
          phone: phone ? onlyDigits(phone) : undefined,
          cardToken,
          installments: method === 'credit_card' ? installments : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao gerar pagamento'); return }

      if (method === 'credit_card') {
        if (data.data.status === 'paid') {
          router.push('/area')
        } else {
          setError('Pagamento recusado. Confira os dados do cartão e tente novamente.')
        }
        return
      }

      setOrderId(data.data.orderId)
      if (data.data.pix) setPix(data.data.pix)
      if (data.data.boleto) setBoleto(data.data.boleto)
      startPolling(data.data.orderId)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao gerar pagamento. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingProduct) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-academy-sand">
        <p className="text-academy-ink">Carregando...</p>
      </main>
    )
  }

  if (!product) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-academy-sand">
        <p className="text-academy-ink">Curso não encontrado.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-academy-sand px-6 py-16">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-academy-ink">{product.title}</h1>
        <p className="mt-1 text-lg font-semibold text-academy-blue">{priceLabel(product.default_price_cents)}</p>

        {orderId && pix ? (
          <div className="mt-8 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <p className="text-sm font-semibold text-academy-ink">Pague com Pix pra liberar o acesso</p>
            {pix.qrCodeUrl && (
              <img src={pix.qrCodeUrl} alt="QR Code Pix" className="mx-auto mt-4 h-56 w-56" />
            )}
            <textarea readOnly value={pix.qrCode} className="mt-4 w-full rounded-lg border border-slate-200 p-2 text-xs" rows={3} />
            <p className="mt-3 text-xs text-slate-500">Aguardando confirmação do pagamento...</p>
          </div>
        ) : orderId && boleto ? (
          <div className="mt-8 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <p className="text-sm font-semibold text-academy-ink">Boleto gerado</p>
            <a
              href={boleto.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-lg bg-academy-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir boleto
            </a>
            <p className="mt-3 break-all text-xs text-slate-500">{boleto.barcode}</p>
            <p className="mt-3 text-xs text-slate-500">Aguardando confirmação do pagamento...</p>
          </div>
        ) : (
          <form onSubmit={submitPayment} className="mt-8 space-y-4 rounded-2xl border border-academy-ink/10 bg-white p-6">
            <div className="flex gap-2">
              {(['pix', 'boleto', 'credit_card'] as Method[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                    method === m ? 'border-academy-blue bg-academy-blue/10 text-academy-blue' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m === 'pix' ? 'Pix' : m === 'boleto' ? 'Boleto' : 'Cartão'}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">CPF</label>
              <input
                required
                value={document}
                onChange={e => setDocumentValue(e.target.value)}
                maxLength={14}
                placeholder="000.000.000-00"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Telefone (opcional)</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="11999998888"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
              />
            </div>

            {method === 'credit_card' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Número do cartão</label>
                  <input
                    required
                    value={cardNumber}
                    onChange={e => setCardNumber(e.target.value)}
                    placeholder="0000 0000 0000 0000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Nome impresso no cartão</label>
                  <input
                    required
                    value={cardHolder}
                    onChange={e => setCardHolder(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Mês</label>
                    <input
                      required
                      value={cardExpMonth}
                      onChange={e => setCardExpMonth(e.target.value)}
                      placeholder="MM"
                      maxLength={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Ano</label>
                    <input
                      required
                      value={cardExpYear}
                      onChange={e => setCardExpYear(e.target.value)}
                      placeholder="AAAA"
                      maxLength={4}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-slate-500">CVV</label>
                    <input
                      required
                      value={cardCvv}
                      onChange={e => setCardCvv(e.target.value)}
                      maxLength={4}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Parcelas</label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-academy-blue"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-academy-blue py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? 'Gerando pagamento...' : `Pagar ${priceLabel(product.default_price_cents)}`}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
