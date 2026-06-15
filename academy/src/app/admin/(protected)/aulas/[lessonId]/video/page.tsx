'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

type Stage = 'idle' | 'uploading' | 'transcoding' | 'done' | 'error'
type Tab = 'upload' | 'url'

export default function LessonVideoUploadPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('upload')

  // Upload + transcode state
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ manifestUrl: string; durationSeconds: number } | null>(null)

  // Direct URL state
  const [directUrl, setDirectUrl] = useState('')
  const [directDuration, setDirectDuration] = useState('')
  const [directSaving, setDirectSaving] = useState(false)
  const [directError, setDirectError] = useState('')
  const [directDone, setDirectDone] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) { setError('Selecione um arquivo de vídeo'); return }

    setError('')
    setStage('uploading')
    setProgress(0)

    const presignRes = await fetch('/api/admin/videos/presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    })
    if (!presignRes.ok) { setError('Erro ao obter URL de upload'); setStage('error'); return }
    const { data: { uploadUrl, rawKey, videoId } } = await presignRes.json()

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100))
      })
      xhr.addEventListener('load', () => xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
      xhr.addEventListener('error', () => reject(new Error('Upload error')))
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    }).catch(e => { setError(e.message); setStage('error'); return null })

    if (stage === 'error') return

    setStage('transcoding')
    setProgress(0)
    const transcodeRes = await fetch('/api/admin/videos/transcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, rawKey, lessonId }),
    })
    if (!transcodeRes.ok) { setError('Erro no transcodificador'); setStage('error'); return }
    const { data } = await transcodeRes.json()

    setResult({ manifestUrl: data.manifestUrl, durationSeconds: data.durationSeconds })
    setStage('done')
  }, [lessonId, stage])

  async function handleDirectUrl(e: React.FormEvent) {
    e.preventDefault()
    setDirectError('')
    setDirectSaving(true)
    const res = await fetch(`/api/admin/lessons/${lessonId}/video-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playbackUrl: directUrl,
        durationSeconds: directDuration ? parseInt(directDuration) : null,
      }),
    })
    setDirectSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setDirectError(d.error ?? 'Erro ao salvar URL')
      return
    }
    setDirectDone(true)
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-lg font-semibold text-white">Vídeo da aula</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-800 p-1">
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'upload' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Upload + transcodificar
        </button>
        <button
          onClick={() => setTab('url')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'url' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Usar URL do R2
        </button>
      </div>

      {/* Upload tab */}
      {tab === 'upload' && (
        <>
          {stage === 'idle' && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-600 p-12 hover:border-academy-gold">
              <span className="text-4xl">🎬</span>
              <span className="text-sm text-slate-300">Arraste ou clique para selecionar o vídeo</span>
              <span className="text-xs text-slate-500">MP4, MOV, MKV — máx 4 GB</span>
              <input type="file" accept="video/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (f) handleFile(f)
              }} />
            </label>
          )}

          {(stage === 'uploading' || stage === 'transcoding') && (
            <div className="rounded-xl bg-slate-800 p-8 text-center">
              <p className="mb-4 text-sm font-medium text-white">
                {stage === 'uploading' ? `Enviando vídeo… ${progress}%` : 'Transcodificando para HLS (720p + 360p)…'}
              </p>
              {stage === 'uploading' && (
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-academy-gold transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
              {stage === 'transcoding' && (
                <div className="flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-academy-gold border-t-transparent" />
                </div>
              )}
              {stage === 'transcoding' && (
                <p className="mt-3 text-xs text-slate-500">Isso pode levar alguns minutos dependendo do tamanho do vídeo.</p>
              )}
            </div>
          )}

          {stage === 'done' && result && (
            <div className="rounded-xl bg-green-900/30 p-6 text-center">
              <p className="text-lg text-green-300">✓ Vídeo processado com sucesso!</p>
              <p className="mt-2 text-sm text-slate-400">Duração: {Math.round(result.durationSeconds / 60)} min</p>
              <button onClick={() => router.back()}
                className="mt-4 rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white"
              >
                Voltar ao produto
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="rounded-xl bg-red-900/30 p-6">
              <p className="text-sm text-red-300">Erro: {error}</p>
              <button onClick={() => { setStage('idle'); setError('') }}
                className="mt-3 text-xs text-slate-400 hover:text-white"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </>
      )}

      {/* Direct URL tab */}
      {tab === 'url' && (
        <>
          {directDone ? (
            <div className="rounded-xl bg-green-900/30 p-6 text-center">
              <p className="text-lg text-green-300">✓ URL vinculada com sucesso!</p>
              <button onClick={() => router.back()}
                className="mt-4 rounded-lg bg-academy-gold px-4 py-2 text-sm font-semibold text-white"
              >
                Voltar ao produto
              </button>
            </div>
          ) : (
            <form onSubmit={handleDirectUrl} className="rounded-xl bg-slate-800 p-6">
              <p className="mb-4 text-xs text-slate-400">
                Cole a URL pública do vídeo no R2 (MP4, HLS ou qualquer formato suportado pelo navegador).
              </p>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-slate-300">URL do vídeo *</label>
                <input
                  required
                  type="url"
                  value={directUrl}
                  onChange={e => setDirectUrl(e.target.value)}
                  placeholder="https://pub-xxx.r2.dev/video.mp4"
                  className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-academy-gold"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-slate-300">Duração (segundos) — opcional</label>
                <input
                  type="number"
                  min="1"
                  value={directDuration}
                  onChange={e => setDirectDuration(e.target.value)}
                  placeholder="ex: 3600 para 1h"
                  className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-academy-gold"
                />
              </div>
              {directError && <p className="mb-3 text-xs text-red-400">{directError}</p>}
              <button
                type="submit"
                disabled={directSaving}
                className="w-full rounded-lg bg-academy-gold py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {directSaving ? 'Salvando…' : 'Salvar URL'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
