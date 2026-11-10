'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import Button,{buttonClass} from '@/components/ui/Button'
import {Skeleton} from '@/components/ui/Skeleton'
import {formatCNPJ} from '@/lib/format'
import {WORKSPACE_AREAS,workspaceHref,type WorkspaceArea} from '@/lib/workspace/presentation'
import WorkspaceConnection from './WorkspaceConnection'
import WorkspaceIcon from './WorkspaceIcon'
import MailPanel from './MailPanel'
import DrivePanel from './DrivePanel'
import MeetingsPanel from './MeetingsPanel'
import CalendarPanel from './CalendarPanel'
import useWorkspaceApi from './useWorkspaceApi'
import {dateLabel,Notice,request,useResource,type Data} from './shared'

export default function WorkspaceHome({area='email',initialCnpj='',initialSelection='cliente:',initialAction,initialRecipient}:{area?:WorkspaceArea;initialCnpj?:string;initialSelection?:string;initialAction?:string;initialRecipient?:string}) {
  const [cnpj,setCnpj]=useState(/^\d{14}$/.test(initialCnpj)?initialCnpj:''),[selection,setSelection]=useState(initialSelection)
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[refresh,setRefresh]=useState(0),[oauth,setOauth]=useState(''),[oauthFailed,setOauthFailed]=useState(false)
  const [entryPending,setEntryPending]=useState(true)
  const entryAction=entryPending&&cnpj===initialCnpj&&selection===initialSelection?initialAction:undefined
  const clientPicker=useRef<HTMLDetailsElement>(null),accountPicker=useRef<HTMLDetailsElement>(null)
  const home=useResource(()=>request(`/api/workspace?search=${encodeURIComponent(query)}`),[query])
  const changed=useCallback(()=>{setRefresh(v=>v+1);window.dispatchEvent(new CustomEvent('projete-workspace-change',{detail:{cnpj}}))},[cnpj])
  const api=useWorkspaceApi(cnpj,selection,changed)
  const overview=useResource(()=>cnpj?api.get('overview'):Promise.resolve({}),[api,cnpj,refresh])
  const [cached,setCached]=useState<{key:string;data:Data}|null>(null),identity=`${cnpj}:${selection}`
  const [kind,key='']=selection.split(':')
  const matches=overview.data?.client?.cnpj===cnpj&&overview.data?.context?.project_kind===kind&&overview.data?.context?.project_key===key
  useEffect(()=>{if(matches&&overview.data)setCached({key:identity,data:overview.data})},[overview.data,identity,matches])
  const info=matches?overview.data:cached?.key===identity?cached.data:null
  const connection=home.data?.connection??info?.connection,configured=home.data?.configured??info?.configured??false
  const connected=connection?.status==='active',ready=Boolean(connected&&info?.client),canWrite=Boolean(ready&&info?.canWrite)
  const client=info?.client||{name:'',emails:[],projects:[]},context=info?.context||{},tool=WORKSPACE_AREAS.find(t=>t.id===area)!
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return()=>clearTimeout(timer)},[search])
  useEffect(()=>{if(!cnpj&&home.data?.clients.length)setCnpj(home.data.clients[0].cnpj)},[cnpj,home.data])
  useEffect(()=>{const url=new URL(window.location.href),error=url.searchParams.get('googleError');if(error||url.searchParams.has('googleConnected')){setOauth(error||'Conta Google conectada.');setOauthFailed(Boolean(error));url.searchParams.delete('googleError');url.searchParams.delete('googleConnected');window.history.replaceState(null,'',url)}},[])
  useEffect(()=>{if(cnpj)window.history.replaceState(null,'',workspaceHref(area,cnpj,selection))},[area,cnpj,selection])
  useEffect(()=>{
    const close=(e:PointerEvent)=>{for(const ref of[clientPicker,accountPicker])if(ref.current&&!ref.current.contains(e.target as Node))ref.current.open=false}
    document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)
  },[])
  function chooseClient(value:string){setEntryPending(false);setCnpj(value);setSelection('cliente:');if(clientPicker.current)clientPicker.current.open=false}
  function openClients(){if(clientPicker.current){clientPicker.current.open=true;clientPicker.current.querySelector('input')?.focus()}}
  const returnTo=workspaceHref(area,cnpj,selection,{action:entryAction==='compose'?'compose':entryAction==='meeting'?'meeting':undefined,recipient:initialRecipient}),connectLink=`/api/integrations/google/connect?returnTo=${encodeURIComponent(returnTo)}`
  const blank=<div className="ws-blank"><div className="ws-blank-icon"><WorkspaceIcon name={area} className="h-7 w-7"/></div><h2 className="text-lg font-semibold text-ink">{!connected?'Seu trabalho, conectado.':'Escolha com quem trabalhar'}</h2><p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-ink-2">{!connected?`Conecte sua conta corporativa para usar ${area==='email'?'o e-mail':area==='drive'?'os arquivos do Drive':'a agenda e as reuniões'} dentro da Projete.`:'Selecione um cliente e um projeto para reunir as conversas, os arquivos e os compromissos.'}</p><div className="mt-5">{!connected&&configured?<a href={connectLink} className={buttonClass('primary')}>Conectar Google</a>:connected?<Button variant="primary" onClick={openClients}>Selecionar cliente</Button>:<span className="text-xs text-ink-3">A conexão Google está sendo preparada.</span>}</div></div>
  return <section className="workspace-app" aria-label="Workspace Projete">
    <header className="flex min-h-[66px] shrink-0 items-center justify-between gap-3 border-b border-line px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-white"><WorkspaceIcon name="grid" className="h-[19px] w-[19px]"/></span><div><p className="text-[15px] font-semibold text-ink">Workspace</p><p className="text-xs text-ink-3">PROJETUS</p></div></div>
      <div className="flex items-center gap-2">{connected?<details ref={accountPicker} className="relative"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-raised"><span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">{connection.email[0].toUpperCase()}</span><span className="hidden max-w-[210px] truncate text-xs text-ink-2 sm:block">{connection.email}</span><WorkspaceIcon name="down" className="h-3 w-3"/></summary><div className="ws-context-menu !left-auto right-0 p-4"><WorkspaceConnection connection={connection} configured={configured} returnTo={returnTo} onChange={()=>{home.reload();overview.reload()}}/></div></details>:configured?<a href={connectLink} className={buttonClass('primary','sm')}>Conectar Google</a>:<span className="text-xs text-ink-3">Google não conectado</span>}</div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label="Áreas do Workspace" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-canvas/70 p-2 md:w-[78px] md:flex-col md:items-stretch md:border-b-0 md:border-r 2xl:w-[168px]">
        {WORKSPACE_AREAS.map(item=><Link key={item.id} href={workspaceHref(item.id,cnpj,selection)} aria-current={area===item.id?'page':undefined} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-medium transition-colors md:flex-none md:px-3 md:text-xs 2xl:min-h-11 2xl:flex-row 2xl:justify-start 2xl:gap-3 2xl:text-sm ${area===item.id?'bg-accent-soft text-accent-ink':'text-ink-2 hover:bg-raised hover:text-ink'} ${item.id==='historico'?'md:!mt-auto':''}`}><WorkspaceIcon name={item.id} className="h-5 w-5 shrink-0"/><span>{item.label}</span></Link>)}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-[58px] shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs sm:px-5">
          <details ref={clientPicker} className="relative min-w-0 max-w-full" onKeyDown={e=>{if(e.key==='Escape'&&clientPicker.current){clientPicker.current.open=false;clientPicker.current.querySelector('summary')?.focus()}}}>
            <summary className="flex min-h-9 max-w-[290px] cursor-pointer list-none items-center gap-2 rounded-md text-ink hover:text-accent"><WorkspaceIcon name="company" className="h-4 w-4 shrink-0"/><span className="truncate font-medium">{client.name||home.data?.clients.find((c:Data)=>c.cnpj===cnpj)?.name||'Selecionar cliente'}</span><WorkspaceIcon name="down" className="h-3 w-3 shrink-0"/></summary>
            <div className="ws-context-menu"><label className="flex items-center gap-2 border-b border-line px-3"><WorkspaceIcon name="search" className="h-4 w-4 text-ink-3"/><input className="ws-mail-search" aria-label="Buscar por cliente, responsável, e-mail ou CNPJ" placeholder="Cliente, responsável, e-mail ou CNPJ" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="max-h-72 overflow-auto p-1.5">{home.busy?<div className="space-y-2 p-3"><Skeleton className="h-10 w-full"/><Skeleton className="h-10 w-full"/></div>:!home.data?.clients.length?<p className="p-4 text-sm text-ink-3">Nenhum cliente encontrado.</p>:home.data.clients.map((c:Data)=><button key={c.cnpj} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-raised ${c.cnpj===cnpj?'bg-accent-soft':''}`} onClick={()=>chooseClient(c.cnpj)}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{c.name}</span>{(c.contacts||[]).filter((contact:Data)=>contact.nome_pessoa||contact.email).slice(0,2).map((contact:Data,index:number)=><span key={index} className="mt-1 block truncate text-xs text-ink-2" title={[contact.nome_pessoa,contact.email].filter(Boolean).join(' · ')}>{[contact.nome_pessoa,contact.email].filter(Boolean).join(' · ')}</span>)}<span className="mt-1 block text-[11px] text-ink-3">{formatCNPJ(c.cnpj)}</span></span>{c.cnpj===cnpj&&<WorkspaceIcon name="check" className="h-4 w-4 text-accent"/>}</button>)}</div></div>
          </details>
          <span className="hidden text-line-strong sm:block">/</span><label className="min-w-0 flex-1"><span className="sr-only">Projeto do cliente</span><select className="h-9 w-full max-w-[310px] cursor-pointer truncate border-0 bg-transparent pr-5 text-xs text-ink-2 outline-none disabled:cursor-default" value={selection} disabled={!client.projects.length} onChange={e=>{setEntryPending(false);setSelection(e.target.value)}}>{client.projects.length?client.projects.map((p:Data)=><option key={`${p.projectKind}:${p.projectKey}`} value={`${p.projectKind}:${p.projectKey}`}>{p.projectKind==='cliente'?'Geral do cliente':p.label}</option>):<option value={selection}>Selecionar projeto</option>}</select></label>
          {cnpj&&<Link href={`/lead/${cnpj}`} title="Abrir ficha do cliente" className="hidden items-center gap-1 text-xs text-ink-3 hover:text-accent lg:flex">Ficha do cliente <WorkspaceIcon name="external" className="h-3 w-3"/></Link>}
        </div>
        {(oauth||home.error||overview.error)&&<div className="shrink-0 space-y-2 border-b border-line p-3">{oauth&&<Notice error={oauthFailed}>{oauth}</Notice>}{(home.error||overview.error)&&<Notice error>{home.error||overview.error} <button className="underline" onClick={()=>{setSelection('cliente:');home.reload();overview.reload()}}>Atualizar</button></Notice>}</div>}
        <div className="ws-tool" key={`${area}:${cnpj}:${selection}:${connection?.email||''}:${connection?.status||''}`} aria-label={tool.description}>
          {area==='email'&&<MailPanel initialCompose={entryAction==='compose'} initialRecipient={initialRecipient} api={api} client={client} canWrite={canWrite} folderBound={Boolean(context.folder_id)} account={connection?.email||''} ready={ready} emptyState={blank}/>}
          {area==='calendario'&&<CalendarPanel initialMeeting={entryAction==='meeting'} initialRecipient={initialRecipient} api={api} client={client} canWrite={canWrite} ready={ready} emptyState={blank}/>}
          {area==='drive'&&<DrivePanel api={api} clientName={client.name} context={context} canWrite={canWrite} ready={ready} emptyState={blank}/>}
          {area==='meet'&&<MeetingsPanel initialMeeting={entryAction==='meeting'} initialRecipient={initialRecipient} api={api} client={client} canWrite={canWrite} ready={ready} emptyState={blank}/>}
          {area==='historico'&&<History api={api} ready={Boolean(info?.client)} refresh={refresh} emptyState={blank}/>}
        </div>
      </div>
    </div>
  </section>
}
function History({api,ready,refresh,emptyState}:{api:ReturnType<typeof useWorkspaceApi>;ready:boolean;refresh:number;emptyState:React.ReactNode}) {
  const {data,error,busy}=useResource(()=>ready?api.get('history'):Promise.resolve({items:[]}),[api,ready,refresh])
  return <div className="flex h-full flex-col"><div className="ws-toolbar"><h1 className="text-lg font-semibold text-ink">Histórico do projeto</h1></div>{!ready?emptyState:<div className="flex-1 overflow-auto p-6">{error&&<Notice error>{error}</Notice>}{busy?<Skeleton className="h-28 w-full"/>:!data?.items.length?<div className="ws-blank"><WorkspaceIcon name="historico" className="mb-4 h-8 w-8 text-ink-3"/><p className="text-sm text-ink-2">As próximas atividades deste projeto aparecerão aqui.</p></div>:<ol className="mx-auto max-w-3xl">{data.items.map((item:Data)=><li key={item.id} className="flex gap-4 border-b border-line py-5"><span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-ink-2"><WorkspaceIcon name={item.action.startsWith('document')?'document':item.action.startsWith('meeting')?'meet':item.action.startsWith('folder')?'folder':'email'} className="h-4 w-4"/></span><div><p className="text-sm font-medium text-ink">{item.summary}</p><p className="mt-1 text-xs text-ink-3">{item.actor_name} · {dateLabel(item.created_at)}</p></div></li>)}</ol>}</div>}</div>
}
