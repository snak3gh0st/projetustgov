'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import { dateLabel,Field,fieldClass,GoogleLink,Notice,RequestError,useResource,type Data,type WorkspaceApi } from './shared'

export default function MailPanel({api,client,canWrite,folderBound,account}:{api:WorkspaceApi;client:Data;canWrite:boolean;folderBound:boolean;account:string}){
  const [page,setPage]=useState(''),[threadId,setThreadId]=useState(''),[compose,setCompose]=useState(false),[version,setVersion]=useState(0)
  const {data,error,busy,reload}=useResource(()=>api.get('mail',{pageToken:page}),[api,page,version])
  return <div className="space-y-4"><Notice>Caixa de {account}. Conversas são sugeridas pelos e-mails cadastrados no cliente; o vínculo com o projeto é uma escolha sua.</Notice>
    {Boolean(data?.ambiguousEmails.length)&&<Notice>Há endereços usados por outros clientes: {data?.ambiguousEmails.join(', ')}. Confira o conteúdo antes de vincular.</Notice>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
      <Panel title="Conversas do cliente" padded={false} actions={<Button size="sm" variant="primary" disabled={!canWrite||!client.emails.length} onClick={()=>{setCompose(true);setThreadId('')}}>Novo e-mail</Button>}>
        <div className="p-3">{error&&<Notice error>{error}</Notice>}{busy?<p role="status" className="p-3 text-sm text-ink-3">Buscando conversas…</p>:!data?.hasContacts?<p className="p-3 text-sm text-ink-3">Cadastre um e-mail no contato deste cliente para localizar conversas.</p>:!data.items.length?<p className="p-3 text-sm text-ink-3">Nenhuma conversa encontrada.</p>:<ul className="space-y-1">{data.items.map((item:Data)=><li key={item.id}><button className={`w-full rounded-lg border p-3 text-left transition-colors ${threadId===item.id?'border-accent/40 bg-accent/5':'border-transparent hover:bg-raised'}`} onClick={()=>{setThreadId(item.id);setCompose(false)}}><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-ink">{item.subject||'Sem assunto'}</p><span className="shrink-0 text-[10px] uppercase tracking-wide text-accent">{item.linked?'Vinculada':'Sugestão'}</span></div><p className="mt-1 truncate text-xs text-ink-2">{item.from}</p><p className="mt-2 line-clamp-2 break-words text-xs text-ink-3">{item.snippet}</p><p className="mt-2 text-[11px] text-ink-3">{dateLabel(item.date)}</p></button></li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={reload} disabled={busy}>Atualizar</Button>{page&&<Button size="sm" onClick={()=>setPage('')}>Primeiras conversas</Button>}{data?.nextPageToken&&<Button size="sm" onClick={()=>setPage(data.nextPageToken)}>Mais conversas</Button>}</div>
        </div>
      </Panel>
      {compose?<Composer key="new" api={api} emails={client.emails} onDone={()=>{setCompose(false);setVersion(v=>v+1)}}/>:threadId?<Thread key={threadId} api={api} id={threadId} emails={client.emails} canWrite={canWrite} folderBound={folderBound} onChange={()=>setVersion(v=>v+1)}/>:<Panel><p className="py-10 text-center text-sm text-ink-3">Selecione uma conversa para ler, responder ou salvar um anexo no projeto.</p></Panel>}
    </div>
  </div>
}
function Thread({api,id,emails,canWrite,folderBound,onChange}:{api:WorkspaceApi;id:string;emails:string[];canWrite:boolean;folderBound:boolean;onChange:()=>void}){
  const {data,error,busy}=useResource(()=>api.get('thread',{id}),[api,id])
  const [message,setMessage]=useState(''),[pending,setPending]=useState(false),[reply,setReply]=useState(false),[uncertain,setUncertain]=useState(false)
  async function action(action:string,values:Data,success:string){setPending(true);setMessage('');try{await api.mutate(action,values);setMessage(success);onChange()}catch(e){setMessage((e as Error).message);setUncertain(e instanceof RequestError&&e.uncertain)}finally{setPending(false)}}
  return <div className="space-y-4"><Panel title={data?.subject||'Conversa'} actions={data&&<GoogleLink href={data.url}>Ver no Gmail</GoogleLink>}>
    {error&&<Notice error>{error}</Notice>}{message&&<div className="mb-3"><Notice>{message}</Notice></div>}{busy&&<p className="text-sm text-ink-3">Abrindo conversa…</p>}
    {data&&<><div className="mb-4 flex flex-wrap gap-2"><Button size="sm" disabled={!canWrite||pending||uncertain} loading={pending} onClick={()=>void action('link_thread',{threadId:id},'Conversa vinculada a este projeto.')}>Vincular ao projeto</Button><Button size="sm" disabled={!canWrite} onClick={()=>setReply(!reply)}>Responder</Button></div>
      <ol className="max-h-[650px] space-y-5 overflow-auto">{data.messages.map((m:Data)=><li key={m.id} className="border-t border-line pt-4"><p className="break-words text-sm font-medium text-ink">{m.from}</p><p className="mt-1 break-words text-xs text-ink-3">Para: {m.to}{m.cc?` · Cc: ${m.cc}`:''} · {dateLabel(m.date)}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{m.text||'Sem texto disponível.'}</p>{m.attachments.length>0&&<ul className="mt-4 space-y-2">{m.attachments.map((a:Data)=><li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised p-2"><span className="min-w-0 break-words text-xs text-ink-2">{a.name} · {(a.size/1000).toFixed(0)} KB</span><Button size="sm" disabled={!canWrite||!folderBound||pending||uncertain||a.size>15000000} title={!folderBound?'Vincule primeiro a pasta do projeto em Documentos':undefined} onClick={()=>void action('save_attachment',{threadId:id,messageId:m.id,attachmentId:a.id,typeLabel:'Anexo de e-mail'},'Anexo salvo e registrado para conferência.')}>Salvar no projeto</Button></li>)}</ul>}</li>)}</ol>
    </>}
  </Panel>{reply&&data&&<Composer api={api} emails={emails} threadId={id} subject={data.subject} onDone={()=>{setReply(false);onChange()}}/>}</div>
}
function Composer({api,emails,threadId,subject='',onDone}:{api:WorkspaceApi;emails:string[];threadId?:string;subject?:string;onDone:()=>void}){
  const [to,setTo]=useState<string[]>(emails.slice(0,1)),[title,setTitle]=useState(subject),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api.mutate('send_email',{to,subject:title,text,...(threadId?{threadId}:{})});onDone()}catch(e){setError((e as Error).message);setUncertain(e instanceof RequestError&&e.uncertain)}finally{setBusy(false)}}
  return <Panel title={threadId?'Responder pela sua conta Google':'Novo e-mail'}><form className="space-y-4" onSubmit={e=>void submit(e)}>
    <fieldset><legend className="mb-2 text-sm font-medium text-ink-2">Destinatários cadastrados no cliente</legend><div className="space-y-2">{emails.map(email=><label key={email} className="flex items-center gap-2 break-all text-sm text-ink-2"><input type="checkbox" checked={to.includes(email)} onChange={e=>setTo(e.target.checked?[...to,email]:to.filter(v=>v!==email))}/>{email}</label>)}</div></fieldset>
    <Field label="Assunto"><input required maxLength={200} disabled={Boolean(threadId)} className={fieldClass} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
    <Field label="Mensagem"><textarea required maxLength={100000} rows={8} className={fieldClass} value={text} onChange={e=>setText(e.target.value)}/></Field>
    {error&&<Notice error>{error}</Notice>}<div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" loading={busy} disabled={uncertain||!to.length||!text.trim()||!title.trim()}>Enviar e-mail{threadId?' nesta conversa':''}</Button><Button onClick={onDone} disabled={busy}>Fechar</Button></div>
    {uncertain&&<Notice>O envio pode ter sido concluído. Confira a conversa no Gmail antes de iniciar outra mensagem.</Notice>}
  </form></Panel>
}
