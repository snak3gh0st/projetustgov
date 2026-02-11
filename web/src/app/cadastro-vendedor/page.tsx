'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createVendedor } from '@/lib/auth-actions'
import { useEffect, useState } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-sigma-neon text-sigma-navy py-3 rounded-lg font-medium hover:bg-sigma-neon/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Criando...' : 'Criar Vendedor'}
    </button>
  )
}

export default function CadastroVendedorPage() {
  const [state, formAction] = useFormState(createVendedor, null)
  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string; email: string; active: boolean }>>([])

  // Fetch existing vendedores
  useEffect(() => {
    fetch('/api/vendedores')
      .then(res => res.json())
      .then(data => setVendedores(data))
      .catch(err => console.error('Failed to fetch vendedores:', err))
  }, [state?.success])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-100 mb-2">
          Cadastrar Vendedor
        </h1>
        <p className="text-gray-400">
          Criar nova conta de vendedor
        </p>
      </div>

      <div className="bg-sigma-navy-light rounded-2xl border border-white/5 p-8 mb-8">
        <form action={formAction} className="space-y-6">
          {state?.error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {state.error}
            </div>
          )}

          {state?.success && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg">
              Vendedor criado com sucesso!
            </div>
          )}

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-300 mb-2">
              Nome
            </label>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              className="w-full bg-sigma-navy border border-gray-700 text-gray-200 px-4 py-3 rounded-lg focus:border-sigma-neon focus:outline-none transition-colors"
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full bg-sigma-navy border border-gray-700 text-gray-200 px-4 py-3 rounded-lg focus:border-sigma-neon focus:outline-none transition-colors"
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full bg-sigma-navy border border-gray-700 text-gray-200 px-4 py-3 rounded-lg focus:border-sigma-neon focus:outline-none transition-colors"
              placeholder="Minimo 8 caracteres"
            />
          </div>

          <SubmitButton />
        </form>
      </div>

      {/* List of existing vendedores */}
      <div className="bg-sigma-navy-light rounded-2xl border border-white/5 p-8">
        <h2 className="text-xl font-heading font-bold text-gray-100 mb-4">
          Vendedores Cadastrados
        </h2>

        {vendedores.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum vendedor cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((vendedor) => (
                  <tr key={vendedor.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 text-gray-200">{vendedor.nome}</td>
                    <td className="py-3 px-4 text-gray-400">{vendedor.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        vendedor.active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {vendedor.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
