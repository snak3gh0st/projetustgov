'use client'
import { useEffect,useState } from 'react'
import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import WorkspaceConnection from './WorkspaceConnection'
import { fieldClass,Notice,request,useResource } from './shared'
import { formatCNPJ } from '@/lib/format'

export default function WorkspaceHome(){
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[oauthError,setOauthError]=useState('')
  const {data,error,busy,reload}=useResource(()=>request(`/api/workspace?search=${encodeURIComponent(query)}`),[query])
  useEffect(()=>{const id=setTimeout(()=>setQuery(search),300);return()=>clearTimeout(id)},[search])
  useEffect(()=>{const url=new URL(window.location.href),message=url.searchParams.get('googleError');if(message)setOauthError(message);if(message||url.searchParams.has('googleConnected')){url.searchParams.delete('googleError');url.searchParams.delete('googleConnected');history.replaceState(null,'',url)}},[])
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-accent">PROJETE · EQUIPE</p><h1 className="mt-2 font-heading text-3xl text-ink">Workspace</h1><p className="mt-2 max-w-2xl text-sm text-ink-2">E-mails, documentos e reuniões no contexto de cada cliente e projeto.</p></header>
    {oauthError&&<Notice error>{oauthError}</Notice>}
    {error&&<Notice error>{error} <Button size="sm" onClick={reload}>Tentar novamente</Button></Notice>}
    {data&&<Panel><WorkspaceConnection connection={data.connection} configured={data.configured} onChange={reload}/></Panel>}
    <Panel title="Com quem você vai trabalhar?" description="Os clientes e as permissões vêm da sua carteira na Projete.">
      <label className="block max-w-lg"><span className="sr-only">Buscar cliente por nome ou CNPJ</span><input type="search" placeholder="Buscar por nome ou CNPJ" value={search} onChange={e=>setSearch(e.target.value)} className={fieldClass}/></label>
      {busy?<p role="status" className="py-8 text-sm text-ink-3">Buscando clientes…</p>:data?.clients.length===0?<p className="py-8 text-sm text-ink-3">Nenhum cliente encontrado na sua carteira atual.</p>:<ul className="mt-5 divide-y divide-line">{data?.clients.map((client:any)=><li key={client.cnpj}><Link href={`/workspace/clientes/${client.cnpj}`} className="group flex items-center justify-between gap-4 rounded-lg px-2 py-4 hover:bg-raised focus-visible:outline-accent"><div className="min-w-0"><p className="font-medium text-ink">{client.name}</p><p className="mt-1 text-xs text-ink-3">{formatCNPJ(client.cnpj)} · {client.projects} {client.projects===1?'registro comercial':'registros comerciais'}</p></div><span className="text-sm text-accent">Abrir <span aria-hidden>→</span></span></Link></li>)}</ul>}
    </Panel>
  </div>
}
