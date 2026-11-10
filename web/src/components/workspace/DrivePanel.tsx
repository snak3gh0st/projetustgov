'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import { FOLDER_MIME } from '@/lib/workspace/domain'
import { Field,fieldClass,GoogleLink,Notice,RequestError,useResource,type Data,type WorkspaceApi } from './shared'

const statuses:Record<string,string>={received:'Recebido',review:'Em análise',approved:'Aprovado',rejected:'Rejeitado'}
export default function DrivePanel({api,clientName,context,canWrite}:{api:WorkspaceApi;clientName:string;context:Data;canWrite:boolean}){
  const [version,setVersion]=useState(0),[page,setPage]=useState(''),[typeLabel,setTypeLabel]=useState('Documento do cliente'),[file,setFile]=useState<File|null>(null)
  const [inputVersion,setInputVersion]=useState(0)
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),[review,setReview]=useState<Data|null>(null),[note,setNote]=useState(''),[status,setStatus]=useState('review')
  const resource=useResource(()=>context.folder_id?api.get('files',{pageToken:page}):Promise.resolve({files:[],documents:[]}),[api,context.folder_id,page,version])
  async function perform(fn:()=>Promise<Data>,success:string,onDone=()=>{}){
    setBusy(true);setMessage('')
    try{await fn();setMessage(success);setVersion(v=>v+1);setReview(null);setNote('');onDone()}catch(e){setMessage((e as Error).message);setUncertain(e instanceof RequestError&&e.uncertain)}finally{setBusy(false)}
  }
  const data=resource.data
  return <div className="space-y-4">
    <Notice>Os arquivos ficam no Drive. A Projete registra o projeto, o tipo e a conferência de cada versão. O acesso exige permissão no cliente e no Google.</Notice>
    {message&&<Notice>{message}</Notice>}
    {!context.folder_id?<FolderPicker api={api} clientName={clientName} canWrite={canWrite}/>:<>
      <Panel title={data?.folder?.name||context.folder_name||'Pasta do projeto'} description="Use o editor oficial do Google para editar documentos, planilhas e apresentações." actions={<GoogleLink href={data?.folder?.url}>Abrir pasta</GoogleLink>}>
        {resource.error&&<Notice error>{resource.error}</Notice>}
        {resource.busy?<p role="status" className="py-4 text-sm text-ink-3">Consultando arquivos e versões…</p>:<>
          {!data?.files.length?<p className="py-4 text-sm text-ink-3">Nenhum arquivo nesta página da pasta.</p>:<ul className="divide-y divide-line">{data.files.map((f:Data)=><li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-ink">{f.name}</p><p className="mt-1 text-xs text-ink-3">{f.mimeType===FOLDER_MIME?'Pasta':f.mimeType}</p></div><div className="flex flex-wrap gap-2"><GoogleLink href={f.webViewLink}>Abrir</GoogleLink>{f.mimeType!==FOLDER_MIME&&<Button size="sm" disabled={!canWrite||busy||uncertain||data.documents.some((d:Data)=>d.fileId===f.id)} onClick={()=>void perform(()=>api.mutate('register_document',{fileId:f.id,typeLabel}),'Documento registrado para conferência.')}>{data.documents.some((d:Data)=>d.fileId===f.id)?'Registrado':'Registrar documento'}</Button>}</div></li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={resource.reload}>Atualizar arquivos</Button>{page&&<Button size="sm" onClick={()=>setPage('')}>Primeira página</Button>}{data?.nextPageToken&&<Button size="sm" onClick={()=>setPage(data.nextPageToken)}>Mais arquivos</Button>}</div>
        </>}
        {canWrite&&<form className="mt-5 space-y-3 border-t border-line pt-4" onSubmit={e=>{e.preventDefault();if(file)void perform(()=>api.upload(file,typeLabel),'Arquivo salvo e registrado para conferência.',()=>{setFile(null);setInputVersion(v=>v+1)})}}>
          <Field label="Tipo de documento para registro ou envio"><input required maxLength={100} className={fieldClass} value={typeLabel} onChange={e=>setTypeLabel(e.target.value)}/></Field>
          <Field label="Adicionar arquivo à pasta · até 15 MB"><input key={inputVersion} type="file" className={fieldClass} onChange={e=>setFile(e.target.files?.[0]||null)}/></Field>
          <Button variant="primary" type="submit" loading={busy} disabled={!file||file.size>15000000||!typeLabel.trim()||uncertain||!data?.folder?.canAdd}>Salvar arquivo no projeto</Button>
        </form>}
      </Panel>
      <Panel title="Conferência documental" description="Uma alteração na versão do Google devolve o documento para análise.">
        {data?.documents.length===0&&<p className="text-sm text-ink-3">Registre os documentos da pasta para acompanhar a conferência.</p>}
        <ul className="divide-y divide-line">{data?.documents.map((d:Data)=><li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-ink">{d.unavailable?'Arquivo indisponível para sua conta':d.name}</p>{!d.unavailable&&<><p className="mt-1 text-xs text-ink-3">{d.typeLabel} · Versão {d.version}</p><p className={`mt-2 text-xs font-semibold ${d.status==='approved'?'text-emerald-700 dark:text-emerald-400':'text-ink-2'}`}>{statuses[d.status]||d.status}</p>{d.note&&<p className="mt-2 whitespace-pre-wrap text-xs text-ink-2">{d.note}</p>}</>}</div>{!d.unavailable&&<div className="flex gap-2"><GoogleLink href={d.url}>Abrir</GoogleLink><Button size="sm" disabled={!canWrite||busy||uncertain} onClick={()=>{setReview(d);setStatus('review');setNote('')}}>Conferir versão</Button></div>}</li>)}</ul>
        {review&&<form className="mt-4 space-y-3 border-t border-line pt-4" onSubmit={e=>{e.preventDefault();void perform(()=>api.mutate('review_document',{id:review.id,status,version:review.version,note}),'Conferência registrada para esta versão.')}}>
          <p className="text-sm font-semibold text-ink">{review.name} · versão {review.version}</p><Field label="Resultado"><select className={fieldClass} value={status} onChange={e=>setStatus(e.target.value)}><option value="review">Em análise</option><option value="approved">Aprovado</option><option value="rejected">Rejeitado</option></select></Field>
          <Field label="Observação da conferência"><textarea required maxLength={2000} rows={3} className={fieldClass} value={note} onChange={e=>setNote(e.target.value)}/></Field><div className="flex gap-2"><Button type="submit" variant="primary" loading={busy} disabled={!note.trim()||uncertain}>Registrar conferência</Button><Button onClick={()=>setReview(null)}>Cancelar</Button></div>
        </form>}
      </Panel>
    </>}
  </div>
}
function FolderPicker({api,clientName,canWrite}:{api:WorkspaceApi;clientName:string;canWrite:boolean}){
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(''),[folder,setFolder]=useState<Data|null>(null),[name,setName]=useState(clientName),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
  const {data,error:loadError,busy:loading}=useResource(()=>api.get('folders',{search:query,pageToken:page}),[api,query,page])
  async function bind(create=false){if(!folder)return;setBusy(true);setError('');try{await api.mutate(create?'create_folder':'bind_folder',create?{parentId:folder.id,name}:{folderId:folder.id})}catch(e){setError((e as Error).message);setUncertain(e instanceof RequestError&&e.uncertain)}finally{setBusy(false)}}
  return <Panel title="Vincular a pasta do projeto" description="Escolha a pasta existente no Drive da sua conta ou de um drive compartilhado.">
    <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setPage('');setQuery(search)}}><label className="min-w-0 flex-1"><span className="sr-only">Nome da pasta</span><input className={fieldClass} value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pasta por nome"/></label><Button type="submit">Buscar</Button></form>
    {(loadError||error)&&<div className="mt-3"><Notice error>{loadError||error}</Notice></div>}
    {loading?<p className="py-5 text-sm text-ink-3">Buscando pastas…</p>:<fieldset className="mt-4 max-h-72 space-y-2 overflow-auto"><legend className="sr-only">Pastas disponíveis</legend>{!data?.files.length&&<p className="text-sm text-ink-3">Nenhuma pasta encontrada com este nome.</p>}{data?.files.map((f:Data)=><label key={f.id} className={`flex items-center gap-3 rounded-lg border p-3 ${folder?.id===f.id?'border-accent/40 bg-accent/5':'border-line'}`}><input type="radio" name="workspace-folder" checked={folder?.id===f.id} onChange={()=>setFolder(f)}/><span className="min-w-0 flex-1 break-words text-sm text-ink">{f.name}<span className="mt-1 block text-[10px] text-ink-3">{f.id}</span></span><GoogleLink href={f.webViewLink}>Ver</GoogleLink></label>)}</fieldset>}
    <div className="mt-3 flex flex-wrap gap-2">{page&&<Button size="sm" onClick={()=>setPage('')}>Primeira página</Button>}{data?.nextPageToken&&<Button size="sm" onClick={()=>setPage(data.nextPageToken)}>Mais pastas</Button>}</div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="primary" loading={busy} disabled={!canWrite||!folder||uncertain} onClick={()=>void bind()}>Vincular pasta selecionada</Button>{folder&&<span className="text-xs text-ink-3">{folder.name}</span>}</div>
    {canWrite&&<details className="mt-5 border-t border-line pt-4"><summary className="cursor-pointer text-sm text-ink-2">Criar uma nova subpasta neste local</summary><div className="mt-3 max-w-xl space-y-3"><Field label="Nome da nova pasta"><input maxLength={200} className={fieldClass} value={name} onChange={e=>setName(e.target.value)}/></Field><Button loading={busy} disabled={!folder||!folder.capabilities?.canAddChildren||!name.trim()||uncertain} onClick={()=>void bind(true)}>Criar dentro de {folder?.name||'uma pasta selecionada'}</Button></div></details>}
  </Panel>
}
