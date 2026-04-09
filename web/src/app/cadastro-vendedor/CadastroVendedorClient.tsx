'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createUsuario } from '@/lib/auth-actions'
import { useEffect, useState, useCallback } from 'react'

interface Usuario {
  id: string
  nome: string
  email: string
  role: 'gestor' | 'coordenador' | 'visualizador' | 'vendedor' | 'adm_produto' | 'coord_aprovacao' | 'assistente_aprovacao' | 'projetista'
  active: boolean
  email_digest?: boolean
  created_at: string
  lead_count: number
  is_self: boolean
}

const ROLE_LABELS: Record<string, string> = {
  gestor: 'Gestor',
  coordenador: 'Coordenador',
  visualizador: 'Visualizador',
  vendedor: 'Vendedor',
  adm_produto: 'Adm Produto',
  coord_aprovacao: 'Coord. Aprovação',
  assistente_aprovacao: 'Assist. Aprovação',
  projetista: 'Projetista',
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  gestor: 'bg-blue-50 text-blue-600',
  coordenador: 'bg-indigo-50 text-indigo-600',
  visualizador: 'bg-purple-50 text-purple-600',
  vendedor: 'bg-green-50 text-green-600',
  adm_produto: 'bg-orange-50 text-orange-600',
  coord_aprovacao: 'bg-sky-50 text-sky-600',
  assistente_aprovacao: 'bg-cyan-50 text-cyan-600',
  projetista: 'bg-violet-50 text-violet-600',
}

const ROLE_SELECT_BG: Record<string, string> = {
  gestor: 'bg-blue-50 text-blue-700 border-blue-200',
  coordenador: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  visualizador: 'bg-purple-50 text-purple-700 border-purple-200',
  vendedor: 'bg-green-50 text-green-700 border-green-200',
  adm_produto: 'bg-orange-50 text-orange-700 border-orange-200',
  coord_aprovacao: 'bg-sky-50 text-sky-700 border-sky-200',
  assistente_aprovacao: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  projetista: 'bg-violet-50 text-violet-700 border-violet-200',
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'visualizador', label: 'Visualizador' },
  { value: 'coordenador', label: 'Coordenador' },
  { value: 'adm_produto', label: 'Adm Produto' },
  { value: 'csm', label: 'CSM' },
  { value: 'coord_aprovacao', label: 'Coord. Aprovação' },
  { value: 'assistente_aprovacao', label: 'Assist. Aprovação' },
  { value: 'projetista', label: 'Projetista' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-[#0072F7] text-white py-3 rounded-lg font-medium hover:bg-[#0058C4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Criando...' : 'Criar Usuario'}
    </button>
  )
}

export default function CadastroVendedorClient({ userRole, creatableRoles }: { userRole: string; creatableRoles: string[] }) {
  const roleOptions = ROLE_OPTIONS.filter(o => creatableRoles.includes(o.value))
  const [state, formAction] = useFormState(createUsuario, null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUsuarios = useCallback(() => {
    setLoading(true)
    fetch('/api/usuarios')
      .then(res => res.json())
      .then(data => {
        setUsuarios(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch usuarios:', err)
        setLoading(false)
      })
  }, [])

  // Fetch on mount and after successful user creation
  useEffect(() => {
    fetchUsuarios()
  }, [fetchUsuarios, state?.success])

  const handleRoleChange = async (userId: string, newRole: string) => {
    // Optimistic update
    setUsuarios(prev =>
      prev.map(u => u.id === userId ? { ...u, role: newRole as Usuario['role'] } : u)
    )

    try {
      const res = await fetch(`/api/usuarios/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const err = await res.json()
        window.alert(`Erro ao atualizar cargo: ${err.error || 'Tente novamente'}`)
        // Revert optimistic update
        fetchUsuarios()
      }
    } catch {
      window.alert('Erro ao atualizar cargo. Tente novamente.')
      fetchUsuarios()
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
          Usuarios
        </h1>
        <p className="text-gray-500">
          Gerenciar usuarios do sistema
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-8">
        <h2 className="text-xl font-heading font-bold text-gray-900 mb-6">
          Criar Novo Usuario
        </h2>
        <form action={formAction} className="space-y-6">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 text-red-500 px-4 py-3 rounded-lg">
              {state.error}
            </div>
          )}

          {state?.success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
              Usuario criado com sucesso!
            </div>
          )}

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-600 mb-2">
              Nome
            </label>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              className="w-full bg-gray-50 border border-gray-300 text-gray-800 px-4 py-3 rounded-lg focus:border-[#0072F7] focus:outline-none transition-colors"
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full bg-gray-50 border border-gray-300 text-gray-800 px-4 py-3 rounded-lg focus:border-[#0072F7] focus:outline-none transition-colors"
              placeholder="email@exemplo.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full bg-gray-50 border border-gray-300 text-gray-800 px-4 py-3 rounded-lg focus:border-[#0072F7] focus:outline-none transition-colors"
              placeholder="Minimo 8 caracteres"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-600 mb-2">
              Cargo
            </label>
            <select
              id="role"
              name="role"
              defaultValue={roleOptions[0]?.value}
              className="w-full bg-gray-50 border border-gray-300 text-gray-800 px-4 py-3 rounded-lg focus:border-[#0072F7] focus:outline-none transition-colors"
            >
              {roleOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <SubmitButton />
        </form>
      </div>

      {/* List of all usuarios */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h2 className="text-xl font-heading font-bold text-gray-900 mb-4">
          Usuarios Cadastrados
        </h2>

        {loading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : usuarios.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum usuario cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Cargo</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Leads</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Digest</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const isGestor = usuario.role === 'gestor'
                  const isSelf = usuario.is_self

                  return (
                    <tr key={usuario.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-gray-800 font-medium">{usuario.nome}</td>
                      <td className="py-3 px-4 text-gray-500">{usuario.email}</td>
                      <td className="py-3 px-4">
                        {isGestor || isSelf ? (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[usuario.role] || 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[usuario.role] || usuario.role}
                          </span>
                        ) : creatableRoles.includes(usuario.role) ? (
                          <select
                            value={usuario.role}
                            onChange={(e) => handleRoleChange(usuario.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded border cursor-pointer focus:outline-none ${ROLE_SELECT_BG[usuario.role] || 'bg-gray-50 text-gray-700 border-gray-200'}`}
                          >
                            {roleOptions.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[usuario.role] || 'bg-gray-100 text-gray-600'}`}>
                            {ROLE_LABELS[usuario.role] || usuario.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">{usuario.lead_count}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          usuario.active
                            ? 'bg-green-50 text-green-600'
                            : 'bg-red-50 text-red-500'
                        }`}>
                          {usuario.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {['adm_produto', 'csm', 'coord_aprovacao', 'assistente_aprovacao', 'projetista'].includes(usuario.role) ? (
                          <button
                            onClick={async () => {
                              const newVal = !usuario.email_digest
                              setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, email_digest: newVal } : u))
                              try {
                                const res = await fetch(`/api/usuarios/${usuario.id}/digest`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ enabled: newVal }),
                                })
                                if (!res.ok) fetchUsuarios()
                              } catch { fetchUsuarios() }
                            }}
                            className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                              usuario.email_digest
                                ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                          >
                            {usuario.email_digest ? 'Ativo' : 'Inativo'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
