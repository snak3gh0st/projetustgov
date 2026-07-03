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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      const res = await fetch(`/api/checkout/pagarme/status?orderId=${id}`)
      if (!res.ok) return
      const { data } = await res.json()
      if (data.status === 'paid') {
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
      const res = await fetch('/api/checkout/pagarme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: slug,
          method,
          document: onlyDigits(document),
          phone: phone ? onlyDigits(phone) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao gerar pagamento'); return }
      setOrderId(data.data.orderId)
      if (data.data.pix) setPix(data.data.pix)
      if (data.data.boleto) setBoleto(data.data.boleto)
      startPolling(data.data.orderId)
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
              {(['pix', 'boleto'] as Method[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                    method === m ? 'border-academy-blue bg-academy-blue/10 text-academy-blue' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m === 'pix' ? 'Pix' : 'Boleto'}
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
