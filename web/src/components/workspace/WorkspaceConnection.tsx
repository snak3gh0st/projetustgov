'use client'
import Button,{buttonClass} from '@/components/ui/Button'
import { Notice,request,type Data } from './shared'
import { useState } from 'react'

export default function WorkspaceConnection({connection,configured,returnTo='/workspace',onChange}:{connection:Data|null;configured:boolean;returnTo?:string;onChange:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false)
  async function disconnect(){
    setBusy(true);setError('')
    try{await request('/api/workspace',{method:'DELETE'});setConfirm(false);onChange()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-ink">{connection?.status==='active'?'Google conectado':connection?.status==='reauth_required'?'Reconecte sua conta Google':'Seu Google na Projete'}</p>
        <p className="mt-1 text-sm text-ink-2">{connection?.status==='active'?connection.email:'Use sua conta corporativa para trabalhar com os clientes que você atende.'}</p></div>
      <div className="flex flex-wrap gap-2">
        {configured&&connection?.status!=='active'&&<a className={buttonClass('primary')} href={`/api/integrations/google/connect?returnTo=${encodeURIComponent(returnTo)}`}>{connection?.status==='reauth_required'?'Reconectar Google':'Conectar Google'}</a>}
        {connection?.status==='active'&&!confirm&&<Button size="sm" variant="ghost" onClick={()=>setConfirm(true)}>Desconectar</Button>}
        {confirm&&<><Button size="sm" onClick={()=>setConfirm(false)}>Manter conexão</Button><Button size="sm" variant="danger" loading={busy} onClick={()=>void disconnect()}>Desconectar da Projete</Button></>}
      </div>
    </div>
    {!configured&&<Notice>A conexão Google ainda precisa ser configurada neste ambiente.</Notice>}
    {confirm&&<Notice>Seus arquivos e mensagens continuam no Google. A Projete deixará de acessar esta conta.</Notice>}
    {error&&<Notice error>{error}</Notice>}
  </div>
}
