'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface ImportResult {
  success: boolean
  format: string
  totalRows: number
  inserted: number
  duplicates: number
  errors: number
  enriched: number
  existing_clients: number
  auto_distributed: number
  api_enriched: number
  api_phone_added: number
  api_email_added: number
  api_errors: number
  api_remaining: number
  sheets: { sheet: string; vendedor: string | null; rows: number; duplicates: number; skipped: number; enriched: number; existing_clients: number }[]
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [isGestor, setIsGestor] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(data => {
        setIsGestor(data?.user?.role === 'gestor')
      })
      .catch(() => setIsGestor(false))
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) { setFile(f); setResults(null); setError(null) }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setResults(null); setError(null) }
  }

  const handleImport = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/import-spreadsheet', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setResults(data)
      } else {
        setError(data.error || 'Erro ao importar')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setResults(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (isGestor === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-[#0072F7] rounded-full animate-spin" />
      </div>
    )
  }

  if (!isGestor) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-2xl p-8 text-center max-w-md">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso restrito</h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">Apenas gestores podem importar planilhas.</p>
          <Link href="/" className="text-[#0072F7] hover:text-blue-700 text-sm">Voltar ao dashboard</Link>
        </div>
      </div>
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/" className="text-gray-400 hover:text-gray-800 transition-colors text-sm">
          &#8592; Voltar ao dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-4">Importar Planilha</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Upload de base bruta Siconv ou planilha CRM de vendedor</p>
      </div>

      {!results ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-2xl p-8">
          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-[#0072F7] bg-blue-50/50 dark:bg-blue-500/10'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <svg className="mx-auto mb-4 w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-gray-600 dark:text-gray-300 font-medium">Arraste um arquivo aqui</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">ou clique para selecionar (.xlsx, .xls, .csv)</p>
          </div>

          {/* Selected file */}
          {file && (
            <div className="mt-6 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-gray-900 dark:text-gray-100 font-medium text-sm">{file.name}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{formatFileSize(file.size)}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={reset} className="text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-sm">Remover</button>
                <button
                  onClick={handleImport}
                  disabled={uploading}
                  className="bg-[#0072F7] hover:bg-[#0058C4] text-white font-semibold rounded-xl px-6 py-3 text-sm disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4">
              <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Results card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#0072F7]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Importacao concluida</h2>
                <span className={`text-xs font-medium rounded-full px-3 py-1 ${
                  results.format === 'siconv'
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-[#0072F7]'
                    : 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400'
                }`}>
                  {results.format === 'siconv' ? 'Siconv / TransferenciaGov' : 'CRM Vendedor'}
                </span>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Linhas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{results.totalRows.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-blue-200 dark:border-blue-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Novos Leads</p>
                <p className="text-2xl font-bold text-[#0072F7]">{results.inserted.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-amber-200 dark:border-amber-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Duplicatas</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{results.duplicates.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-red-200 dark:border-red-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Erros</p>
                <p className="text-2xl font-bold text-red-500 dark:text-red-400">{results.errors}</p>
              </div>
            </div>

            {/* Auto-distribution + enrichment stats */}
            {(results.auto_distributed > 0 || results.enriched > 0 || results.existing_clients > 0) && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {results.auto_distributed > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-emerald-200">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Auto-distribuidos</p>
                    <p className="text-xl font-bold text-emerald-600">{results.auto_distributed.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Round-robin entre vendedores</p>
                  </div>
                )}
                {results.enriched > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-blue-200 dark:border-blue-500/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Contatos Enriquecidos</p>
                    <p className="text-xl font-bold text-[#0072F7]">{results.enriched.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Tel/email da base de proponentes</p>
                  </div>
                )}
                {results.existing_clients > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-orange-200 dark:border-orange-500/20">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ja sao Clientes</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{results.existing_clients.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Sinalizados nas observacoes</p>
                  </div>
                )}
              </div>
            )}

            {/* BrasilAPI enrichment stats */}
            {results.api_enriched > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-purple-200 dark:border-purple-500/20">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Receita Federal (API)</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{results.api_enriched}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    {results.api_phone_added} tel, {results.api_email_added} email
                  </p>
                </div>
                {results.api_remaining > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-yellow-200">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pendentes API</p>
                    <p className="text-xl font-bold text-yellow-600">{results.api_remaining}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Serao buscados no proximo upload</p>
                  </div>
                )}
              </div>
            )}

            {/* Per-sheet breakdown */}
            {results.sheets.length > 1 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Detalhes por aba</h3>
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-4 py-2 text-left text-xs text-gray-400 dark:text-gray-500 uppercase">Aba</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 dark:text-gray-500 uppercase">Vendedor</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 dark:text-gray-500 uppercase">Inseridos</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 dark:text-gray-500 uppercase">Duplicatas</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 dark:text-gray-500 uppercase">Ignorados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.sheets.map((s, i) => (
                        <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{s.sheet}</td>
                          <td className="px-4 py-2 text-gray-400 dark:text-gray-500">{s.vendedor || '-'}</td>
                          <td className="px-4 py-2 text-[#0072F7]">{s.rows}</td>
                          <td className="px-4 py-2 text-amber-600 dark:text-amber-400">{s.duplicates}</td>
                          <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{s.skipped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={reset}
            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium rounded-xl px-6 py-3 text-sm transition-colors"
          >
            Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  )
}
