'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function RedefinirSenhaForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Falha ao redefinir senha.')
        return
      }
      setDone(true)
    } catch {
      setError('Falha ao redefinir senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-md px-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm text-center space-y-4">
          <p className="text-red-500 text-sm">Link inválido ou expirado.</p>
          <Link href="/esqueci-senha" className="text-sm text-[#0072F7] hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Projete" style={{ width: 180, height: 'auto' }} />
          </div>
          <p className="text-gray-400 dark:text-gray-500 text-sm">Hub da PROJETUS</p>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-700 dark:text-gray-300 text-sm">Senha redefinida com sucesso!</p>
            <Link
              href="/login"
              className="block w-full bg-[#0072F7] text-white font-semibold py-3 rounded-lg hover:bg-[#0058C4] transition-colors text-center text-sm"
            >
              Fazer login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Nova senha</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Escolha uma nova senha para sua conta.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Nova senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Confirmar senha
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
                />
                {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0072F7] text-white font-semibold py-3 rounded-lg hover:bg-[#0058C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
