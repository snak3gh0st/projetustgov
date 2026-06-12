export default function ConnectReturnPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-sky-100 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
          Stripe Connect
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Retorno do onboarding recebido
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          A empresa voltou do onboarding hospedado pela Stripe. O passo seguinte e
          verificar no webhook ou via API se a conta ja ficou apta para cobrar.
        </p>
      </div>
    </main>
  )
}
