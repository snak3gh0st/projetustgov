'use client'

import { useEffect, useState, useCallback } from 'react'

type Comment = {
  id: string
  target_type: 'proposta' | 'execucao'
  target_key: string
  author_id: string
  author_nome: string | null
  body: string
  created_at: string
}

type Props = {
  targetType: 'proposta' | 'execucao'
  targetKey: string
  currentUserRole: string
}

const COMMENT_ROLES = ['csm', 'gestor', 'admin', 'adm_produto']
function canCommentTgovClient(role: string): boolean {
  return COMMENT_ROLES.includes(role)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `há ${day}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

const MAX_BODY = 5000

export default function CommentsThread({ targetType, targetKey, currentUserRole }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const canWrite = canCommentTgovClient(currentUserRole)

  const load = useCallback(async () => {
    if (!targetKey) return
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ target_type: targetType, target_key: targetKey })
      const res = await fetch(`/api/tgov/comments?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setComments(Array.isArray(json.comments) ? json.comments : [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar comentários')
    } finally {
      setLoading(false)
    }
  }, [targetType, targetKey])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) {
      setSubmitError('Comentário vazio')
      return
    }
    if (trimmed.length > MAX_BODY) {
      setSubmitError(`Máximo ${MAX_BODY} caracteres`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/tgov/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_key: targetKey, body: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      if (json?.comment) {
        setComments((prev) => [json.comment, ...prev])
      } else {
        await load()
      }
      setBody('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Falha ao enviar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* List */}
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {loading && (
          <div className="space-y-2">
            <div className="h-12 bg-gray-100 rounded animate-pulse" />
            <div className="h-12 bg-gray-100 rounded animate-pulse" />
          </div>
        )}
        {!loading && fetchError && (
          <p className="text-xs text-red-600">Erro: {fetchError}</p>
        )}
        {!loading && !fetchError && comments.length === 0 && (
          <p className="text-xs text-gray-400 italic">Sem comentários ainda.</p>
        )}
        {!loading && !fetchError && comments.map((c) => (
          <div
            key={c.id}
            className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-800">
                {c.author_nome || 'Usuário'}
              </span>
              <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
              {c.body}
            </p>
          </div>
        ))}
      </div>

      {/* Input */}
      {canWrite && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting}
            rows={3}
            maxLength={MAX_BODY}
            placeholder="Escreva um comentário..."
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {body.length}/{MAX_BODY}
            </span>
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Enviando...' : 'Comentar'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
