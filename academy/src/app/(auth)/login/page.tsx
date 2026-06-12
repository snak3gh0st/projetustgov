'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/learner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro ao entrar'); return }
      router.push('/area')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-academy-sand px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-academy-blue">PROJETUS</p>
          <h1 className="mt-1 text-2xl font-semibold text-academy-ink">Academy</h1>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-academy-ink">Entrar na sua conta</h2>
          {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-academy-blue focus:ring-1 focus:ring-academy-blue"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Senha</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-academy-blue focus:ring-1 focus:ring-academy-blue"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit" disabled={loading}
            className="mt-6 w-full rounded-lg bg-academy-blue py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="mt-4 text-center text-sm text-slate-500">
            Não tem conta?{' '}
            <Link href="/cadastro" className="font-medium text-academy-blue hover:underline">
              Cadastre-se
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
