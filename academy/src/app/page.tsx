export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-white px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-academy-blue">
          Projetus Academy
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Academy bootstrap ready
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          This app now includes the core Stripe Connect and Checkout foundation for
          connected companies, one-time products, checkout sessions, and webhook
          processing.
        </p>
      </div>
    </main>
  )
}
