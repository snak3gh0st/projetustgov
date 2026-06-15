'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Profile = { id: string; email: string; name: string | null }

type Course = {
  lesson_count?: number
  completed_count?: number
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-academy-gold'

export default function ContaPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<{ total: number; completed: number; lessons: number } | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/learner/me')
      .then((r) => r.json())
      .then((j) => {
        if (j?.data) setProfile(j.data)
      })
      .catch(() => {})

    fetch('/api/area/courses')
      .then((r) => r.json())
      .then((j) => {
        const courses: Course[] = Array.isArray(j?.data) ? j.data : []
        const total = courses.length
        const completed = courses.filter(
          (c) => (c.completed_count ?? 0) >= (c.lesson_count ?? 0) && (c.lesson_count ?? 0) > 0,
        ).length
        const lessons = courses.reduce((sum, c) => sum + (c.completed_count ?? 0), 0)
        setStats({ total, completed, lessons })
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/learner/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof j?.error === 'string' ? j.error : 'Não foi possível alterar a senha')
        return
      }
      setSuccess('Senha alterada com sucesso')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/area" className="text-xs font-semibold text-white/60 transition hover:text-white">
        ← Voltar
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-white">Minha conta</h1>

      {/* Profile card */}
      <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold text-academy-gold">Perfil</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Nome</label>
            <input className={inputCls} value={profile?.name ?? ''} readOnly />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Email</label>
            <input className={inputCls} value={profile?.email ?? ''} readOnly />
          </div>
        </div>
      </div>

      {/* Stats card */}
      {stats && (
        <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900 p-6">
          <h2 className="text-sm font-semibold text-academy-gold">Meu progresso</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-white/50">Cursos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.completed}</div>
              <div className="text-xs text-white/50">Concluídos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.lessons}</div>
              <div className="text-xs text-white/50">Aulas concluídas</div>
            </div>
          </div>
        </div>
      )}

      {/* Change password card */}
      <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold text-academy-gold">Alterar senha</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Senha atual</label>
            <input
              type={showPw ? 'text' : 'password'}
              className={inputCls}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Nova senha</label>
            <input
              type={showPw ? 'text' : 'password'}
              className={inputCls}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Confirmar nova senha</label>
            <input
              type={showPw ? 'text' : 'password'}
              className={inputCls}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} className="accent-academy-gold" />
            Mostrar senhas
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-academy-gold px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Salvando…' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
