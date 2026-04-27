'use client'

interface CsmDashboardClientProps {
  userRole: string
  userName: string | null
}

export default function CsmDashboardClient({ userRole, userName }: CsmDashboardClientProps) {
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Clientes CSM</h1>
        <p className="text-sm text-gray-500 mt-1">
          Area de Customer Success — sessao ativa: {userName ?? 'sem nome'} ({userRole})
        </p>
      </header>
      <section className="bg-white border border-gray-200 rounded-md p-6">
        <p className="text-sm text-gray-600">
          Lista unificada de clientes Projetos e dashboards de prioridade serao adicionados na Phase 23.
        </p>
      </section>
    </div>
  )
}
