'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function safeNextPath(value: string | null): string {
  if (!value) return '/area'
  try {
    const resolved = new URL(value, window.location.origin)
    if (resolved.origin !== window.location.origin) return '/area'
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return '/area'
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      router.push(safeNextPath(new URLSearchParams(window.location.search).get('next')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mt-2 text-2xl font-semibold text-white">Capte Recursos</h1>
          <p className="mt-1 text-sm text-white/40">Acesse sua conta para assistir às aulas</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-zinc-900 p-8">
          {error && <p className="mb-4 rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</p>}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">E-mail</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-academy-gold focus:ring-1 focus:ring-academy-gold"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 pr-10 text-sm text-white placeholder-white/20 outline-none focus:border-academy-gold focus:ring-1 focus:ring-academy-gold"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="text-right mt-1">
            <Link href="/login/recuperar" className="text-xs text-white/30 hover:text-white/60 transition-colors">
              Esqueci minha senha
            </Link>
          </div>
          <button
            type="submit" disabled={loading}
            className="mt-6 w-full rounded-lg bg-academy-gold py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="mt-5 text-center text-sm text-white/30">
            Não tem conta?{' '}
            <Link href="/cadastro" className="font-medium text-academy-gold hover:opacity-80">
              Cadastre-se
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
