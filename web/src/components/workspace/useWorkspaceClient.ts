'use client'

import { useEffect, useState } from 'react'

/** Operational/ERP records can exist outside the CRM. Do not offer broken entries. */
export default function useWorkspaceClient(rawCnpj?: string | null) {
  const cnpj = rawCnpj?.replace(/\D/g, '') || ''
  const [result, setResult] = useState({ cnpj: '', allowed: false })
  useEffect(() => {
    if (cnpj.length !== 14) return
    const controller = new AbortController()
    fetch(`/api/workspace?search=${encodeURIComponent(cnpj)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setResult({ cnpj, allowed: Boolean(data?.clients?.some((client: { cnpj: string }) => client.cnpj === cnpj)) }) })
      .catch(() => { if (!controller.signal.aborted) setResult({ cnpj, allowed: false }) })
    return () => controller.abort()
  }, [cnpj])
  return result.cnpj === cnpj && result.allowed
}
