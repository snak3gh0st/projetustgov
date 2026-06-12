'use client'

import { useState } from 'react'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDone(true)
  }

  if (done) {
    return (
      <p className="mt-6 rounded-lg bg-white/20 px-6 py-3 text-sm font-medium text-white">
        ✓ Ótimo! Te avisaremos em {email}
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-6 flex max-w-md gap-3">
      <input
        type="email" required value={email} onChange={e => setEmail(e.target.value)}
        placeholder="seu@email.com"
        className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:border-white/50 focus:bg-white/20"
      />
      <button type="submit" className="rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-academy-blue hover:bg-blue-50">
        Quero acesso
      </button>
    </form>
  )
}
