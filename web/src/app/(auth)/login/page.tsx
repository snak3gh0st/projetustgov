'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { login } from '@/lib/auth-actions'

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-[#0072F7] text-white font-semibold py-3 rounded-lg hover:bg-[#0058C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Entrando...' : 'Entrar'}
    </button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, null)

  return (
    <div className="w-full max-w-md px-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Projete" style={{ width: 180, height: 'auto' }} />
          </div>
          <p className="text-gray-400 text-sm">CRM de Vendas</p>
          <p className="text-[11px] text-[#0072F7] mt-2">
            powered by <span className="font-semibold">SigmaIntel</span>
          </p>
        </div>

        {/* Form */}
        <form action={formAction} className="space-y-5">
          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
            />
            {state?.error && (
              <p className="text-red-500 text-sm mt-1">{state.error}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Senha"
              required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#0072F7] transition-colors"
            />
          </div>

          {/* Submit Button */}
          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
