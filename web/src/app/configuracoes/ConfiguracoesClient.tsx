'use client'

import { useEffect, useState } from 'react'

type Language = 'pt-BR' | 'en-US'

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'pt-BR', label: 'Portugues (pt-BR)' },
  { value: 'en-US', label: 'English (en-US)' },
]

export default function ConfiguracoesClient() {
  const [language, setLanguage] = useState<Language>('pt-BR')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bot-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.language) setLanguage(data.language as Language)
      })
      .catch(() => setError('Falha ao carregar configuracoes'))
      .finally(() => setLoading(false))
  }, [])

  async function handleLanguageChange(lang: Language) {
    setLanguage(lang)
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch('/api/bot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erro ao salvar idioma')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Erro de rede ao salvar idioma')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
          <p className="text-sm text-gray-500 mt-1">Preferencias do sistema de alertas</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Configuracoes do Bot</h2>
          <p className="text-sm text-gray-500 mb-5">
            Idioma das mensagens enviadas pelo bot do Telegram e email de alertas.
          </p>

          {loading ? (
            <div className="animate-pulse h-10 bg-gray-100 rounded-lg w-64" />
          ) : (
            <div className="space-y-3">
              {LANGUAGE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    language === opt.value
                      ? 'border-[#0072F7] bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="language"
                    value={opt.value}
                    checked={language === opt.value}
                    onChange={() => handleLanguageChange(opt.value)}
                    disabled={saving}
                    className="accent-[#0072F7] w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {saved && (
            <div className="mt-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
              Idioma salvo!
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {saving && !saved && !error && (
            <p className="mt-3 text-xs text-gray-400">Salvando...</p>
          )}
        </div>
      </div>
    </div>
  )
}
