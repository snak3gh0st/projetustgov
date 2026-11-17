import Link from 'next/link'

/** Aviso de número fora do ar: as mensagens novas não chegam e o envio falha até reconectar. */
/** gestao: true leva à reconexão, false pede para avisar a gestão; sem o valor (card do lead), só o aviso. */
export function AvisoDesconectado({ gestao, estado, canal = 'qr' }: { gestao?: boolean; estado?: string; canal?: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="font-medium">{estado === 'indisponivel' ? 'Não foi possível verificar a conexão.' : estado === 'conectando' ? 'WhatsApp conectando.' : 'WhatsApp desconectado.'}</span>
      <span>{estado === 'indisponivel' ? 'A consulta ao serviço falhou. Isso não confirma uma desconexão.' : estado === 'conectando' ? 'Aguarde a conclusão da conexão.' : 'Verifique a conexão deste número antes de continuar.'}</span>
      {gestao === true && <Link href={`/conversas/conexao?canal=${canal}`} className="font-medium underline underline-offset-2">Ver conexão</Link>}
      {gestao === false && <span>Avise a gestão.</span>}
    </div>
  )
}
