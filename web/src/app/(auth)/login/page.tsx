'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { login } from '@/lib/auth-actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-sigma-neon text-sigma-navy font-semibold py-3 rounded-lg hover:bg-sigma-neon/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Entrando...' : 'Entrar'}
    </button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null)

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-sigma-navy-light border border-sigma-neon/20 rounded-2xl p-8 backdrop-blur-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-heading text-4xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#FD225C] via-[#7A4BAC] to-[#0072F7] bg-clip-text text-transparent">PROJETUS</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">CRM de Vendas</p>
          <p className="text-[11px] text-[#0072F7] mt-2">
            powered by <span className="font-semibold">SigmaIntel</span>
          </p>
        </div>

        {/* Form */}
        <form action={formAction} className="space-y-5">
          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full px-4 py-3 bg-sigma-navy border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon transition-colors"
            />
            {state?.error && (
              <p className="text-red-400 text-sm mt-1">{state.error}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Senha"
              required
              className="w-full px-4 py-3 bg-sigma-navy border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sigma-neon transition-colors"
            />
          </div>

          {/* Submit Button */}
          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
