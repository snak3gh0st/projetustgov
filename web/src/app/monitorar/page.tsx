'use client'

import { useState, useEffect, useCallback } from 'react'

interface MonitoradoRow {
  id: number
  cnpj: string
  nome: string | null
  email: string | null
  telefone: string | null
  municipio: string | null
  uf: string | null
  valor_emenda: number | null
  parlamentar: string | null
  nr_emenda: string | null
  created_at: string
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

function formatCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

export default function MonitorarPage() {
  const [cnpjs, setCnpjs] = useState<MonitoradoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [inputCnpj, setInputCnpj] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)

  const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cnpj-monitorado')
      if (res.ok) {
        const data = await res.json()
        setCnpjs(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Check push notification status
  const checkPushStatus = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (!reg) return
      const sub = await reg.pushManager.getSubscription()
      setPushEnabled(!!sub)
    } catch {
      // Ignore errors
    }
  }, [])

  useEffect(() => {
    fetchList()
    checkPushStatus()
  }, [fetchList, checkPushStatus])

  const handleAddCnpj = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    setAddLoading(true)
    try {
      const res = await fetch('/api/cnpj-monitorado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: inputCnpj }),
      })
      if (res.status === 409) {
        setAddError('CNPJ já monitorado')
        return
      }
      if (res.status === 404) {
        setAddError('CNPJ não encontrado na base de leads')
        return
      }
      if (!res.ok) {
        const data = await res.json()
        setAddError(data.error || 'Erro ao adicionar CNPJ')
        return
      }
      setInputCnpj('')
      await fetchList()
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemove = async (cnpj: string) => {
    await fetch('/api/cnpj-monitorado', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj }),
    })
    await fetchList()
  }

  const handleEnablePush = async () => {
    if (!VAPID_PUBLIC_KEY) {
      alert('Chave VAPID não configurada. Contate o administrador.')
      return
    }
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('Permissão de notificação negada.')
        return
      }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      setPushEnabled(true)
    } catch (err) {
      console.error('Push subscription failed:', err)
      alert('Erro ao ativar notificações. Verifique se o site está em HTTPS.')
    } finally {
      setPushLoading(false)
    }
  }

  const handleDisablePush = async () => {
    setPushLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (!reg) return
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push-subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushEnabled(false)
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 font-heading">CNPJs Monitorados</h1>
        <p className="text-sm text-gray-500 mt-1">
          Acompanhe CNPJs de interesse e receba alertas de novas emendas
        </p>
      </div>

      {/* Push notification toggle */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">Notificações Push</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Receba alertas quando um CNPJ monitorado receber nova emenda
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pushEnabled ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Notificacoes ativas
              </span>
              <button
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
              >
                Desativar
              </button>
            </>
          ) : (
            <button
              onClick={handleEnablePush}
              disabled={pushLoading || !('serviceWorker' in navigator)}
              className="px-4 py-2 text-sm bg-[#0072F7] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pushLoading ? 'Ativando...' : 'Ativar Notificacoes'}
            </button>
          )}
        </div>
      </div>

      {/* Add CNPJ form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <form onSubmit={handleAddCnpj} className="flex gap-3 items-start">
          <div className="flex-1">
            <input
              type="text"
              value={inputCnpj}
              onChange={(e) => {
                setInputCnpj(e.target.value)
                setAddError(null)
              }}
              placeholder="Digite o CNPJ (somente numeros ou com mascara)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {addError && (
              <p className="text-xs text-red-600 mt-1">{addError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={addLoading || !inputCnpj.trim()}
            className="px-4 py-2 text-sm bg-[#0072F7] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {addLoading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Carregando...</div>
      ) : cnpjs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-sm">Nenhum CNPJ monitorado.</p>
          <p className="text-gray-400 text-xs mt-1">Adicione um CNPJ acima para comecar.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CNPJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UF / Municipio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Emenda</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parlamentar / Nr Emenda</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adicionado em</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cnpjs.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{row.nome || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-600">{formatCnpj(row.cnpj)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {row.telefone ? (
                          <p className="text-gray-700">{row.telefone}</p>
                        ) : null}
                        {row.email ? (
                          <p className="text-xs text-gray-500 truncate max-w-[160px]">{row.email}</p>
                        ) : null}
                        {!row.telefone && !row.email && (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.uf || row.municipio ? (
                        <div>
                          {row.uf && <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 mr-1">{row.uf}</span>}
                          {row.municipio && <span className="text-gray-600 text-xs">{row.municipio}</span>}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{formatCurrency(row.valor_emenda)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {row.parlamentar && <p className="text-gray-700 text-xs">{row.parlamentar}</p>}
                        {row.nr_emenda && <p className="text-gray-400 text-xs">{row.nr_emenda}</p>}
                        {!row.parlamentar && !row.nr_emenda && <span className="text-gray-400 text-xs">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemove(row.cnpj)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
