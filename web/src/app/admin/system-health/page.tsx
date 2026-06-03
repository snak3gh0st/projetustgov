import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { collectSystemHealth, type HealthStatus } from '@/lib/system-health'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<HealthStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
}

const STATUS_DOT: Record<HealthStatus, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

function statusLabel(status: HealthStatus) {
  return status === 'ok' ? 'OK' : status === 'warning' ? 'Atenção' : 'Erro'
}

function StatCard({
  label,
  value,
  helper,
  status,
}: {
  label: string
  value: string
  helper?: string
  status: HealthStatus
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">{label}</p>
        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          {statusLabel(status)}
        </span>
      </div>
      <p className="text-2xl font-heading font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {helper && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{helper}</p>}
    </div>
  )
}

export default async function SystemHealthPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/sem-permissao')
  }

  const health = await collectSystemHealth()

  return (
    <div className="space-y-6 w-full max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900 dark:text-gray-100">Saúde do Sistema</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Visão geral do runtime, banco, autenticação e contas críticas. Acesso exclusivo de admin.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${STATUS_STYLES[health.status]}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[health.status]}`} />
          Geral: {statusLabel(health.status)}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Banco"
          value={health.database.status === 'ok' && health.database.latency_ms != null ? `${health.database.latency_ms} ms` : 'Indisponível'}
          helper={`${health.database.host}${health.database.name ? ` • ${health.database.name}` : ''}`}
          status={health.database.status}
        />
        <StatCard
          label="Auth"
          value={health.auth.status === 'ok' ? 'OK' : 'Revisar'}
          helper="AUTH_SECRET, NEXTAUTH_SECRET, AUTH_URL e NEXTAUTH_URL"
          status={health.auth.status}
        />
        <StatCard
          label="Usuários ativos"
          value={String(health.users.active)}
          helper={`${health.users.inactive} inativos · ${health.users.total} total`}
          status={health.users.status}
        />
        <StatCard
          label="Admins ativos"
          value={String(health.users.active_admins)}
          helper={`${health.users.active_gestores} gestores ativos`}
          status={health.users.active_admins > 0 ? 'ok' : 'error'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100">Configuração do Runtime</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Sinais rápidos de ambiente e conexão.</p>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[health.database.status === 'error' ? 'error' : health.auth.status]}`}>
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[health.database.status === 'error' ? 'error' : health.auth.status]}`} />
              {statusLabel(health.database.status === 'error' ? 'error' : health.auth.status)}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <Row label="AUTH_SECRET" value={health.auth.auth_secret ? 'Presente' : 'Ausente'} tone={health.auth.auth_secret ? 'ok' : 'error'} />
            <Row label="NEXTAUTH_SECRET" value={health.auth.nextauth_secret ? 'Presente' : 'Ausente'} tone={health.auth.nextauth_secret ? 'ok' : 'error'} />
            <Row label="AUTH_URL" value={health.auth.auth_url ? 'Presente' : 'Ausente'} tone={health.auth.auth_url ? 'ok' : 'error'} />
            <Row label="NEXTAUTH_URL" value={health.auth.nextauth_url ? 'Presente' : 'Ausente'} tone={health.auth.nextauth_url ? 'ok' : 'error'} />
            <Row label="AUTH_TRUST_HOST" value={health.auth.trust_host ? 'true' : 'false'} tone={health.auth.trust_host ? 'ok' : 'warning'} />
            <Row label="Banco" value={health.database.status === 'ok' ? 'Conectado' : 'Falha'} tone={health.database.status} />
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
          <div className="mb-5">
            <h2 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100">Contas Críticas</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Login e acesso dos perfis que precisam continuar vivos.</p>
          </div>

          <div className="space-y-3">
            {health.users.critical_accounts.map(account => (
              <div key={account.email} className="flex flex-col gap-2 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{account.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{account.email}</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[account.status]}`}>
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[account.status]}`} />
                    {statusLabel(account.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {account.found
                    ? `${account.nome || 'Sem nome'} · ${account.role || 'sem role'} · ${account.active ? 'ativo' : 'inativo'}`
                    : 'Conta não encontrada no banco de produção'}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-6">
        <h2 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100 mb-4">Distribuição por Cargo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-4 font-medium">Cargo</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {health.users.by_role.map(row => (
                <tr key={`${row.role}-${row.active}`} className="border-b border-gray-100 dark:border-gray-800/70 last:border-b-0">
                  <td className="py-3 pr-4 text-gray-800 dark:text-gray-200">{row.role}</td>
                  <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{row.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="py-3 pr-4 text-gray-900 dark:text-gray-100 font-medium">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {health.notes.length > 0 && (
        <section className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 shadow-sm p-6">
          <h2 className="text-lg font-heading font-bold text-amber-800 dark:text-amber-200 mb-3">Notas</h2>
          <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
            {health.notes.map(note => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone: HealthStatus }) {
  const toneStyles: Record<HealthStatus, string> = {
    ok: 'text-emerald-600 dark:text-emerald-300',
    warning: 'text-amber-600 dark:text-amber-300',
    error: 'text-red-600 dark:text-red-300',
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 dark:bg-gray-800/70 px-4 py-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-semibold ${toneStyles[tone]}`}>{value}</span>
    </div>
  )
}
