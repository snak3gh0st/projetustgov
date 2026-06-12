export default function ConnectRefreshPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-sky-100 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Stripe Connect
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Continue o onboarding da conta
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          A Stripe pediu para reiniciar ou atualizar o fluxo de onboarding. Gere um
          novo account link e redirecione a empresa novamente.
        </p>
      </div>
    </main>
  )
}
