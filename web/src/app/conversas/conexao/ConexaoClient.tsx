'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import type { EstadoConexao } from '@/lib/whatsapp/channels'

const LABEL: Record<EstadoConexao, string> = {
  conectado: 'Conectado', conectando: 'Conectando', desconectado: 'Desconectado', indisponivel: 'Não foi possível verificar a conexão',
}

export default function ConexaoClient() {
  const params = useSearchParams()
  const [canal, setCanal] = useState(params.get('canal') === 'oficial' ? 'oficial' : 'qr')
  const [canais, setCanais] = useState<{ id: string; nome: string }[]>([])
  const [estado, setEstado] = useState<EstadoConexao | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const busy = useRef(false)
  const canalAtual = useRef(canal)
  canalAtual.current = canal

  const atualizar = useCallback(async () => {
    const r = await fetch(`/api/whatsapp/conexao?canal=${canal}`, { cache: 'no-store' }).catch(() => null)
    const d = r?.ok ? await r.json().catch(() => null) : null
    if (canalAtual.current !== canal) return
    setEstado(d?.estado ?? 'indisponivel')
    setQr(d?.qrBase64 ?? null)
    if (d?.canais) setCanais(d.canais)
  }, [canal])

  const conectar = useCallback(async () => {
    if (busy.current || canal !== 'qr') return
    busy.current = true
    setCarregando(true)
    setErro(null)
    try {
      const r = await fetch('/api/whatsapp/conexao?canal=qr', { method: 'POST' }).catch(() => null)
      const d = r ? await r.json().catch(() => null) : null
      if (canalAtual.current !== 'qr') return
      if (!r?.ok) { setErro(d?.error ?? 'Não foi possível falar com o serviço do WhatsApp.'); return }
      setEstado(d.estado)
      setQr(d.qrBase64)
    } finally {
      busy.current = false
      setCarregando(false)
    }
  }, [canal])

  // Polling only observes the session and the QR emitted by Evolution. It never starts another socket.
  useEffect(() => {
    void atualizar()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void atualizar() }, 5_000)
    return () => window.clearInterval(timer)
  }, [atualizar])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/conversas?canal=${canal}`} className="text-sm text-ink-3 hover:text-ink">Voltar para o WhatsApp</Link>
      <PageHeader title="Conexão do WhatsApp" description="Acompanhe cada número de atendimento." />
      {canais.length > 1 && <label className="block text-sm text-ink">Número<select aria-label="Número de atendimento" value={canal} onChange={(e) => { setCanal(e.target.value); setQr(null); setEstado(null); setErro(null) }} className="ml-2 rounded border border-line bg-surface p-2">{canais.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
      <Panel>
        <div className="space-y-4 text-sm text-ink">
          <p role="status">{estado ? canal === 'oficial' && estado === 'conectado' ? 'Canal configurado. A entrega é confirmada por mensagem.' : LABEL[estado] : 'Verificando...'}</p>
          {canal === 'oficial' ? <p className="text-ink-2">Este número usa a API oficial. A gestão configura a conexão da Meta; não é necessário ler QR. Para iniciar conversas fora da janela de atendimento, use um modelo aprovado.</p> : estado !== 'conectado' && <>
            <ol className="list-decimal space-y-1 pl-5 text-ink-2">
              <li>No celular das consultorias, abra o WhatsApp e toque em Aparelhos conectados.</li>
              <li>Toque em Conectar um aparelho e leia o código.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr ? <img src={qr} alt="QR code para conectar o WhatsApp" className="h-64 w-64 rounded-lg border border-line bg-white p-2" />
              : estado === 'conectando' ? <p>Aguardando o código ou a confirmação do celular. Esta tela acompanha a tentativa em andamento.</p>
                : <Button variant="primary" onClick={() => void conectar()} disabled={carregando || estado !== 'desconectado'}>{carregando ? 'Gerando código...' : 'Gerar QR code'}</Button>}
          </>}
          {estado === 'indisponivel' && <p className="text-ink-2">Uma falha na consulta não confirma que o número foi desconectado. Aguarde uma nova verificação.</p>}
          {erro && <p role="alert" className="text-red-700 dark:text-red-300">{erro}</p>}
        </div>
      </Panel>
    </div>
  )
}
