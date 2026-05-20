'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface ImportResult {
  success: boolean
  total: number
  inserted: number
  duplicates: number
  skipped: number
  errors: number
}

export default function UploadClientesPage() {
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
      const res = await fetch('/api/import-existing-clients', { method: 'POST', body: formData })
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
          <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">Apenas gestores podem importar clientes existentes.</p>
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
        <Link href="/" className="text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors text-sm">
          &#8592; Voltar ao dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-4">Importar Clientes Existentes</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Upload da base de clientes Projetus (CLIENTES.xlsx)</p>
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">Instrucoes</h3>
        <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1 list-disc list-inside">
          <li>Faca upload do arquivo CLIENTES.xlsx com a base de clientes existentes da Projetus.</li>
          <li>O arquivo deve conter as colunas: <strong>CNPJ</strong> e <strong>ENTIDADE</strong></li>
          <li>Clientes ja cadastrados serao ignorados automaticamente (sem duplicatas)</li>
          <li>Apenas gestores podem realizar esta operacao</li>
        </ul>
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
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <svg className="mx-auto mb-4 w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-gray-600 dark:text-gray-300 font-medium">Arraste um arquivo aqui</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">ou clique para selecionar (.xlsx, .xls)</p>
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
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Base de clientes existentes atualizada</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Linhas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{results.total.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-blue-200 dark:border-blue-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Inseridos</p>
                <p className="text-2xl font-bold text-[#0072F7]">{results.inserted.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-amber-200 dark:border-amber-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Duplicatas</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{results.duplicates.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Ignorados</p>
                <p className="text-2xl font-bold text-gray-400 dark:text-gray-500">{results.skipped.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-red-200 dark:border-red-500/20">
                <p className="text-xs text-gray-500 dark:text-gray-400">Erros</p>
                <p className="text-2xl font-bold text-red-500 dark:text-red-400">{results.errors}</p>
              </div>
            </div>
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
