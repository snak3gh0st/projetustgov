type SuccessPageProps = {
  searchParams?: Promise<{
    session_id?: string
  }>
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams
  const sessionId = params?.session_id

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-emerald-100 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Pagamento confirmado
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Compra concluida com sucesso
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          O checkout foi concluido e o webhook da Stripe vai confirmar a liberacao do
          acesso no Academy.
        </p>
        {sessionId ? (
          <div className="mt-8 rounded-2xl bg-slate-950 px-5 py-4 text-sm text-slate-100">
            <span className="font-medium text-white">Checkout Session:</span> {sessionId}
          </div>
        ) : null}
      </div>
    </main>
  )
}
