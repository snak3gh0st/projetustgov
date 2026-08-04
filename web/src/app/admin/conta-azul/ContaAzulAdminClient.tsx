'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type StatusResponse = {
  configured: boolean
  tenantKey: string
  clientId: string
  redirectUri: string
  connection: {
    id: string
    status: string
    companyName: string | null
    accountEmail: string | null
    tokenExpiresAt: string | null
    lastConnectedAt: string | null
    lastPolledAt: string | null
    hasTokens: boolean
  } | null
  error?: string
}

export default function ContaAzulAdminClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/conta-azul', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar status')
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (connected === '1') setMessage('Conta Azul conectada com sucesso.')
    if (oauthError) setError(oauthError)
    if (connected || oauthError) {
      router.replace('/admin/conta-azul')
    }
    void load()
  }, [load, router, searchParams])

  async function disconnect() {
    if (!confirm('Desconectar Conta Azul? Tokens serão removidos.')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/conta-azul', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar')
      setMessage('Desconectado.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setBusy(false)
    }
  }

  async function testApi() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/integrations/conta-azul/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Teste falhou')
      setMessage('API OK — conta conectada respondeu.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no teste')
    } finally {
      setBusy(false)
    }
  }

  const conn = status?.connection
  const active = conn?.status === 'active' && conn.hasTokens

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      <div>
        <h1 className="font-heading text-3xl font-bold text-gray-900 dark:text-gray-100">
          Conta Azul
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Conexão OAuth com a API v2 para sync financeiro. Acesso gestor/admin.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Status</h2>
          {loading ? (
            <span className="text-xs text-gray-400">Carregando…</span>
          ) : (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
              }`}
            >
              {active ? 'Conectado' : conn?.status || 'Não conectado'}
            </span>
          )}
        </div>

        {status && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-400">Tenant</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{status.tenantKey}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Client ID</dt>
              <dd className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                {status.clientId}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-400">Redirect URI</dt>
              <dd className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                {status.redirectUri}
              </dd>
            </div>
            {conn && (
              <>
                <div>
                  <dt className="text-gray-400">Empresa</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {conn.companyName || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">E-mail</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {conn.accountEmail || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Token expira</dt>
                  <dd className="text-gray-700 dark:text-gray-300">
                    {conn.tokenExpiresAt
                      ? new Date(conn.tokenExpiresAt).toLocaleString('pt-BR')
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Última conexão</dt>
                  <dd className="text-gray-700 dark:text-gray-300">
                    {conn.lastConnectedAt
                      ? new Date(conn.lastConnectedAt).toLocaleString('pt-BR')
                      : '—'}
                  </dd>
                </div>
              </>
            )}
          </dl>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href="/api/integrations/conta-azul/connect"
            className={`inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 ${
              busy ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {active ? 'Reconectar' : 'Conectar Conta Azul'}
          </a>
          <button
            type="button"
            disabled={busy || !active}
            onClick={() => void testApi()}
            className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Testar API
          </button>
          <button
            type="button"
            disabled={busy || !active}
            onClick={() => void disconnect()}
            className="inline-flex items-center rounded-lg border border-red-200 dark:border-red-900/50 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
          >
            Desconectar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 text-sm text-gray-600 dark:text-gray-400 space-y-2">
        <p className="font-semibold text-gray-900 dark:text-gray-100">Como conectar</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Clique em Conectar Conta Azul (abre o login Conta Azul).</li>
          <li>Autorize com a conta ERP da empresa PROJETUS.</li>
          <li>Você volta para esta página com status Conectado.</li>
          <li>Use Testar API para validar GET /v1/pessoas/conta-conectada.</li>
        </ol>
        <p className="pt-2 text-xs">
          O redirect cadastrado no portal precisa ser exatamente:{' '}
          <code className="font-mono">
            https://projete.sigmaintel.io/api/integrations/conta-azul/callback
          </code>
        </p>
      </div>
    </div>
  )
}
