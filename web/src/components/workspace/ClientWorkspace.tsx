'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import SectionTabs from '@/components/SectionTabs'
import WorkspaceConnection from './WorkspaceConnection'
import MailPanel from './MailPanel'
import DrivePanel from './DrivePanel'
import MeetingsPanel from './MeetingsPanel'
import { dateLabel,fieldClass,Notice,operationId,request,RequestError,useResource,type Data,type WorkspaceApi } from './shared'
import { formatCNPJ } from '@/lib/format'

export default function ClientWorkspace({cnpj,embedded=false}:{cnpj:string;embedded?:boolean}){
  const digits=cnpj.replace(/\D/g,''),[selected,setSelected]=useState('cliente:'),[tab,setTab]=useState('mail'),[refresh,setRefresh]=useState(0)
  const [oauthMessage,setOauthMessage]=useState(''),[oauthFailed,setOauthFailed]=useState(false)
  const [projectKind,projectKey='']=selected.split(':')
  const contextQuery=useMemo(()=>new URLSearchParams({projectKind,projectKey}).toString(),[projectKind,projectKey])
  const base=`/api/workspace/clients/${encodeURIComponent(digits)}`
  const changed=useCallback(()=>{setRefresh(n=>n+1);window.dispatchEvent(new CustomEvent('projete-workspace-change',{detail:{cnpj:digits}}))},[digits])
  const api=useMemo<WorkspaceApi>(()=>({
    get:(view,params={})=>request(`${base}?${contextQuery}&${new URLSearchParams({view,...params})}`),
    async mutate(action,values){
      const operation=await operationId(`${digits}:${selected}:${action}`,values)
      try{
        const result=await request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,action,projectKind,projectKey,requestId:operation.id})})
        operation.clear();changed();return result
      }catch(e){if(e instanceof RequestError&&!e.uncertain&&e.status!==409)operation.clear();throw e}
    },
    async upload(file,typeLabel){
      const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',')
      const operation=await operationId(`${digits}:${selected}:upload`,{name:file.name,type:file.type,typeLabel,hash})
      const form=new FormData();form.set('file',file);form.set('typeLabel',typeLabel);form.set('requestId',operation.id);form.set('projectKind',projectKind);form.set('projectKey',projectKey)
      try{const result=await request(base,{method:'PUT',body:form});operation.clear();changed();return result}
      catch(e){if(e instanceof RequestError&&!e.uncertain&&e.status!==409)operation.clear();throw e}
    },
  }),[base,contextQuery,digits,selected,projectKind,projectKey,changed])
  const {data,error,busy,reload}=useResource(()=>api.get('overview'),[api,refresh])
  // Preserve forms while refreshing the summary after an operation.
  const [overview,setOverview]=useState<Data|null>(null)
  useEffect(()=>{setOverview(null)},[digits,selected])
  useEffect(()=>{if(data)setOverview(data)},[data])
  const info=data||overview
  useEffect(()=>{const query=new URLSearchParams(window.location.search),kind=query.get('projectKind'),key=query.get('projectKey')||'';if(['cliente','comercial','convenio'].includes(kind||''))setSelected(`${kind}:${key}`);const view=query.get('tab');if(['mail','drive','meetings','history'].includes(view||''))setTab(view!)},[])
  useEffect(()=>{const url=new URL(window.location.href),message=url.searchParams.get('googleError');if(message||url.searchParams.has('googleConnected')){setOauthMessage(message||'Conta Google conectada.');setOauthFailed(Boolean(message));url.searchParams.delete('googleError');url.searchParams.delete('googleConnected');window.history.replaceState(null,'',url)}},[])
  return <section id="workspace" className="min-w-0 space-y-4 scroll-mt-6" aria-label="Workspace do cliente">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent">WORKSPACE DO CLIENTE</p><h2 className={`${embedded?'text-xl':'text-2xl'} mt-1 font-heading text-ink`}>{info?.client.name||'E-mails, documentos e reuniões'}</h2><p className="mt-1 text-sm text-ink-3">{formatCNPJ(digits)}</p></div>{!embedded&&<Link href={`/lead/${digits}`} className="text-sm text-accent hover:underline">Ver ficha do cliente →</Link>}</header>
    {oauthMessage&&<Notice error={oauthFailed}>{oauthMessage}</Notice>}
    {error&&<Notice error>{error} <Button size="sm" onClick={reload}>Tentar novamente</Button></Notice>}
    {busy&&!info&&<p role="status" className="py-5 text-sm text-ink-3">Carregando o Workspace do cliente…</p>}
    {info&&<>
      <Panel><div className="space-y-5"><WorkspaceConnection connection={info.connection} configured={info.configured} returnTo={`/workspace/clientes/${digits}?projectKind=${projectKind}&projectKey=${projectKey}`} onChange={()=>setRefresh(n=>n+1)}/>
        <div className="border-t border-line pt-4"><label className="block max-w-2xl space-y-1.5 text-sm font-medium text-ink-2"><span>Trabalhar no projeto</span><select className={fieldClass} value={selected} onChange={e=>setSelected(e.target.value)}>{info.client.projects.map((p:Data)=><option key={`${p.projectKind}:${p.projectKey}`} value={`${p.projectKind}:${p.projectKey}`}>{p.label}</option>)}</select></label><p className="mt-2 text-xs text-ink-3">Conversas, pasta e reuniões são vinculadas a esta seleção.</p></div>
      </div></Panel>
      <SectionTabs ariaLabel="Ferramentas do Workspace" controls={`workspace-panel-${digits}`} value={tab} onChange={setTab} tabs={[{id:'mail',label:'E-mails'},{id:'drive',label:'Documentos'},{id:'meetings',label:'Agenda e Meet'},{id:'history',label:'Histórico'}]}/>
      <div role="tabpanel" id={`workspace-panel-${digits}`} key={`${selected}:${info.connection?.email||''}:${info.connection?.status||''}`}>
        {tab==='history'?<History api={api} refresh={refresh}/>:info.connection?.status!=='active'?<Notice>Conecte sua conta Google para abrir as ferramentas deste cliente.</Notice>:<>
          {!info.canWrite&&<div className="mb-3"><Notice>Seu perfil tem acesso de consulta. Envios, convites e alterações ficam disponíveis aos responsáveis com permissão de edição.</Notice></div>}
          {tab==='mail'&&<MailPanel api={api} client={info.client} canWrite={info.canWrite} folderBound={Boolean(info.context.folder_id)} account={info.connection.email}/>}
          {tab==='drive'&&<DrivePanel api={api} clientName={info.client.name} context={info.context} canWrite={info.canWrite}/>}
          {tab==='meetings'&&<MeetingsPanel api={api} client={info.client} canWrite={info.canWrite}/>}
        </>}
      </div>
    </>}
  </section>
}
function History({api,refresh}:{api:WorkspaceApi;refresh:number}){
  const {data,error,busy}=useResource(()=>api.get('history'),[api,refresh])
  return <Panel title="Atividades deste projeto" description="As mensagens e os eventos privados aparecem apenas para o titular da conexão.">{error&&<Notice error>{error}</Notice>}{busy?<p className="text-sm text-ink-3">Carregando atividades…</p>:!data?.items.length?<p className="text-sm text-ink-3">Nenhuma atividade registrada neste projeto.</p>:<ol className="divide-y divide-line">{data.items.map((item:Data)=><li key={item.id} className="py-3"><p className="text-sm font-medium text-ink">{item.summary}</p><p className="mt-1 text-xs text-ink-3">{item.actor_name} · {dateLabel(item.created_at)}</p></li>)}</ol>}</Panel>
}
