'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'

type Estado = 'conectado' | 'conectando' | 'desconectado'

const ESTADO_LABEL: Record<Estado, { texto: string; cor: string }> = {
  conectado: { texto: 'Conectado', cor: 'bg-emerald-500' },
  conectando: { texto: 'Conectando', cor: 'bg-amber-500' },
  desconectado: { texto: 'Desconectado', cor: 'bg-red-500' },
}

// Liga o número das consultorias ao PROJETE pelo QR code (gestão).
export default function ConexaoClient() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const atualizar = useCallback(async () => {
    const r = await fetch('/api/whatsapp/conexao', { cache: 'no-store' }).catch(() => null)
    const d = r?.ok ? await r.json() : null
    setEstado(d?.estado ?? 'desconectado')
    if (d?.estado === 'conectado') setQr(null)
  }, [])

  const conectar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const r = await fetch('/api/whatsapp/conexao', { method: 'POST' }).catch(() => null)
    const d = r ? await r.json().catch(() => null) : null
    setCarregando(false)
    if (!r?.ok) { setErro(d?.error ?? 'Não foi possível falar com o serviço do WhatsApp.'); return }
    setEstado(d.estado)
    setQr(d.qrBase64)
  }, [])

  useEffect(() => { void atualizar() }, [atualizar])
  // O QR expira: renova a cada 20 s enquanto não conecta.
  useEffect(() => {
    if (!qr || estado === 'conectado') return
    const t = window.setInterval(() => { void atualizar().then(() => void conectar()) }, 20_000)
    return () => window.clearInterval(t)
  }, [qr, estado, atualizar, conectar])

  const info = estado ? ESTADO_LABEL[estado] : null
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/conversas" className="text-sm text-ink-3 hover:text-ink">Voltar para o WhatsApp</Link>
      <PageHeader title="Conexão do WhatsApp" description="Número das consultorias ligado ao PROJETE." />
      <Panel>
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-ink">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${info?.cor ?? 'bg-line-strong'}`} />
            {info?.texto ?? 'Verificando...'}
          </p>
          {estado !== 'conectado' && (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
                <li>No celular das consultorias, abra o WhatsApp e toque em Aparelhos conectados.</li>
                <li>Toque em Conectar um aparelho e aponte a câmera para o código abaixo.</li>
                <li>O celular continua funcionando normalmente depois de conectar.</li>
              </ol>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code para conectar o WhatsApp" className="h-64 w-64 rounded-lg border border-line bg-white p-2" />
              ) : (
                <Button variant="primary" onClick={() => void conectar()} disabled={carregando}>{carregando ? 'Gerando código...' : 'Gerar QR code'}</Button>
              )}
            </>
          )}
          {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{erro}</p>}
        </div>
      </Panel>
    </div>
  )
}
