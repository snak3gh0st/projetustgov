export default function CheckoutCancelPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-amber-100 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
          Checkout cancelado
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          A compra nao foi concluida
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          O aluno voltou do checkout sem finalizar o pagamento. Voce pode oferecer
          retry, suporte comercial ou uma nova sessao de pagamento.
        </p>
      </div>
    </main>
  )
}
