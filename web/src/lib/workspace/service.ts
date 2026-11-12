import { WorkspaceError, FOLDER_MIME, contactEmails, emailAddress, gmailContactQuery, safeGoogleUrl, validateMeeting,
  type ContextKey, type GoogleFile, type WorkspaceActor } from './domain.ts'
import { GoogleApi, eventView } from './google.ts'
import { WorkspaceStore } from './store.ts'
import { type MeetingOutcome } from './calendar-policy.ts'

type Row=Record<string,any>
export class WorkspaceService {
  constructor(public store:WorkspaceStore,public google:GoogleApi,public actor:WorkspaceActor){}
  async connected(){const c=await this.store.connection(this.actor.userId);if(!c||c.status!=='active')throw new WorkspaceError('Conecte sua conta Google para continuar.',409);return c}
  async load(key:ContextKey){const [client,context]=await Promise.all([this.store.client(key.cnpj),this.store.context(key)]);return{client,context}}
  async overview(key:ContextKey){
    const {client,context}=await this.load(key)
    const [connection,history,documents]=await Promise.all([this.store.safeConnection(this.actor.userId),this.store.history(context.id,this.actor.userId),
      this.store.rows('SELECT review_status,count(*)::int count FROM workspace_documents WHERE context_id=$1 GROUP BY review_status',[context.id])])
    return{client,context,connection,history,documentSummary:documents}
  }
  async mail(key:ContextKey,pageToken=''){
    const account=await this.connected(),{client,context}=await this.load(key)
    const links=await this.store.links(context.id,this.actor.userId,'thread',account.google_sub)
    const q=gmailContactQuery(client.emails),listed=q?await this.google.threads(q,pageToken):{threads:[]}
    const ids=Array.from(new Set<string>([...(pageToken?[]:links.map(l=>l.remote_id)),...(listed.threads??[]).map((t:Row)=>t.id)])).slice(0,70)
    const items=[]
    // Limited parallel reads, never unbounded API fan-out.
    for(let i=0;i<ids.length;i+=4){
      const batch=await Promise.all(ids.slice(i,i+4).map(async id=>{
        try{const t=await this.google.thread(id);return{id:t.id,subject:t.subject,snippet:t.messages.at(-1)?.text.slice(0,180)??t.snippet,
          from:t.messages.at(-1)?.from,date:t.messages.at(-1)?.date,linked:links.some(l=>l.remote_id===id)}}
        catch(e){if(e instanceof WorkspaceError&&e.status===404)return null;throw e}
      }));items.push(...batch.filter(Boolean))
    }
    return{items,nextPageToken:listed.nextPageToken??null,ambiguousEmails:client.ambiguousEmails,hasContacts:client.emails.length>0}
  }
  async thread(key:ContextKey,id:string){
    const account=await this.connected();const {client}=await this.load(key),thread=await this.google.thread(id)
    if(!threadRelates(thread,client.emails))throw new WorkspaceError('Esta conversa não corresponde aos contatos cadastrados do cliente.',403)
    return {...thread,url:`https://mail.google.com/mail/?authuser=${encodeURIComponent(account.email)}#all/${encodeURIComponent(thread.id)}`}
  }
  async linkThread(key:ContextKey,id:string){
    const account=await this.connected(),{context}=await this.load(key),thread=await this.thread(key,id)
    await this.store.link(context.id,this.actor.userId,'thread',id,{subject:thread.subject},account.google_sub)
    await this.store.activity(context.id,this.actor.userId,'thread.linked','Conversa vinculada ao projeto',this.actor.userId)
    return{ok:true}
  }
  async send(key:ContextKey,input:{requestId:string;to:string[];subject:string;text:string;threadId?:string}){
    const account=await this.connected(),{client,context}=await this.load(key)
    const to=input.to.map(emailAddress)
    if(to.some(e=>!client.emails.includes(e)))throw new WorkspaceError('Cadastre os destinatários nos contatos deste cliente antes de enviar.',403)
    let subject=input.subject,replyMessageId:string|undefined,references:string|undefined
    if(input.threadId){
      const thread=await this.thread(key,input.threadId),last=thread.messages.at(-1)
      if(!last?.messageId)throw new WorkspaceError('A conversa não tem um identificador de resposta válido. Envie uma nova mensagem.')
      subject=last.subject;replyMessageId=last.messageId;references=[last.references,last.messageId].filter(Boolean).join(' ')
    }
    return this.store.operation(this.actor,context.id,'send_email',input.requestId,input,account.google_sub,async()=>{
      const sent=await this.google.send({...input,from:account.email,to,subject,replyMessageId,references})
      await this.store.link(context.id,this.actor.userId,'thread',sent.threadId,{subject},account.google_sub)
      await this.store.activity(context.id,this.actor.userId,'email.sent','E-mail enviado pela conta conectada',this.actor.userId)
      return sent
    })
  }
  async bindFolder(key:ContextKey,id:string){
    await this.connected();const {context}=await this.load(key),folder=await this.google.file(id)
    if(folder.mimeType!==FOLDER_MIME||folder.trashed)throw new WorkspaceError('Selecione uma pasta ativa do Google Drive.')
    await this.store.transaction(async c=>{
      const current=(await c.query('SELECT folder_id FROM workspace_contexts WHERE id=$1 FOR UPDATE',[context.id])).rows[0]
      if(current.folder_id&&current.folder_id!==id)throw new WorkspaceError('Este projeto já tem uma pasta vinculada. Preserve a pasta atual para manter os arquivos e o histórico.',409)
      const pending=await c.query("SELECT 1 FROM workspace_operations WHERE context_id=$1 AND kind='create_folder' AND status IN ('processing','uncertain') LIMIT 1",[context.id])
      if(pending.rowCount)throw new WorkspaceError('A criação da pasta está em andamento ou precisa ser conferida no Drive.',409)
      await c.query('UPDATE workspace_contexts SET folder_id=$2,folder_name=$3,folder_bound_by=$4,updated_at=now() WHERE id=$1',[context.id,id,folder.name,this.actor.userId])
    })
    await this.store.activity(context.id,this.actor.userId,'folder.linked','Pasta do Drive vinculada ao projeto')
    return{ok:true}
  }
  async createFolder(key:ContextKey,input:{requestId:string;parentId:string;name:string}){
    const account=await this.connected(),{context}=await this.load(key)
    if(context.folder_id)throw new WorkspaceError('O projeto já tem uma pasta vinculada.',409)
    const parent=await this.google.file(input.parentId)
    if(parent.mimeType!==FOLDER_MIME||parent.trashed||parent.capabilities?.canAddChildren!==true)throw new WorkspaceError('Você não pode criar pastas neste local do Drive.',403)
    return this.store.operation(this.actor,context.id,'create_folder',input.requestId,input,account.google_sub,async()=>{
      const folder=await this.google.createFile(input.name,FOLDER_MIME,input.parentId,context.id)
      if(!folder.id)throw new WorkspaceError('A criação da pasta não foi confirmada. Confira o Drive.',502,true)
      await this.store.rows('UPDATE workspace_contexts SET folder_id=$2,folder_name=$3,folder_bound_by=$4,updated_at=now() WHERE id=$1',[context.id,folder.id,folder.name,this.actor.userId])
      await this.store.activity(context.id,this.actor.userId,'folder.created','Pasta do projeto criada no Google Drive')
      return{id:folder.id}
    })
  }
  async folder(key:ContextKey,write=false){
    const {context}=await this.load(key)
    if(!context.folder_id)throw new WorkspaceError('Vincule a pasta existente deste cliente/projeto no Drive.',409)
    const folder=await this.google.file(context.folder_id)
    if(folder.trashed||folder.mimeType!==FOLDER_MIME)throw new WorkspaceError('A pasta vinculada não está mais disponível.',409)
    if(write&&folder.capabilities?.canAddChildren!==true)throw new WorkspaceError('Sua conta Google não pode adicionar arquivos nesta pasta.',403)
    return{context,folder}
  }
  async files(key:ContextKey,pageToken='',folderId=''){
    await this.connected();const {context,folder}=await this.folder(key)
    const active=folderId&&folderId!==folder.id?await this.google.file(folderId):folder
    if(active.trashed||active.mimeType!==FOLDER_MIME||(active.id!==folder.id&&!await this.google.withinFolder(active,folder.id)))throw new WorkspaceError('A pasta deve estar dentro do Drive vinculado a este projeto.',403)
    const list=await this.google.files(active.id,pageToken),stored=await this.store.rows('SELECT * FROM workspace_documents WHERE context_id=$1 ORDER BY updated_at DESC LIMIT 60',[context.id])
    const documents=[]
    for(const d of stored){
      try{
        const file=(list.files??[]).find((f:GoogleFile)=>f.id===d.file_id)??await this.google.file(d.file_id)
        if(file.trashed||!await this.google.withinFolder(file,folder.id)){documents.push({id:d.id,fileId:d.file_id,unavailable:true});continue}
        const version=String(file.version??file.modifiedTime??'')
        const updated=(await this.store.rows(`UPDATE workspace_documents SET name=$2,mime_type=$3,version=$4,
          review_status=CASE WHEN review_status IN ('approved','rejected') AND reviewed_version IS DISTINCT FROM $4 THEN 'review' ELSE review_status END
          WHERE id=$1 RETURNING *`,[d.id,file.name,file.mimeType,version]))[0]
        documents.push({...docView(updated),url:safeGoogleUrl(file.webViewLink),unavailable:false})
      }catch(e){if(e instanceof WorkspaceError&&[403,404].includes(e.status)){documents.push({id:d.id,fileId:d.file_id,unavailable:true});continue}throw e}
    }
    return{folder:{id:active.id,name:active.name,url:safeGoogleUrl(active.webViewLink),canAdd:active.capabilities?.canAddChildren===true},rootFolder:{id:folder.id,name:folder.name},
      files:(list.files??[]).map((f:GoogleFile)=>({...f,webViewLink:safeGoogleUrl(f.webViewLink)})),documents,nextPageToken:list.nextPageToken??null}
  }
  async registerDocument(key:ContextKey,fileId:string,typeLabel:string){
    await this.connected();const {context,folder}=await this.folder(key),file=await this.google.file(fileId)
    if(file.trashed||file.mimeType===FOLDER_MIME||!await this.google.withinFolder(file,folder.id))throw new WorkspaceError('O documento deve estar na pasta vinculada a este projeto.',403)
    const version=String(file.version??file.modifiedTime??'')
    if(!version)throw new WorkspaceError('O Google não informou uma versão para conferir este documento.',409)
    const row=(await this.store.rows(`INSERT INTO workspace_documents(context_id,file_id,name,mime_type,version,type_label,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(context_id,file_id) DO UPDATE SET type_label=EXCLUDED.type_label RETURNING *`,
    [context.id,file.id,file.name,file.mimeType,version,typeLabel,this.actor.userId]))[0]
    await this.store.activity(context.id,this.actor.userId,'document.received','Documento registrado para conferência')
    return docView(row)
  }
  async reviewDocument(key:ContextKey,input:{id:string;status:'review'|'approved'|'rejected';version:string;note:string}){
    await this.connected();const {context,folder}=await this.folder(key)
    const doc=(await this.store.rows('SELECT * FROM workspace_documents WHERE id=$1 AND context_id=$2',[input.id,context.id]))[0]
    if(!doc)throw new WorkspaceError('Documento não encontrado neste projeto.',404)
    const file=await this.google.file(doc.file_id),version=String(file.version??file.modifiedTime??'')
    if(file.trashed||!await this.google.withinFolder(file,folder.id))throw new WorkspaceError('O arquivo não está mais disponível na pasta do projeto.',409)
    if(!version||version!==input.version)throw new WorkspaceError('O documento mudou. Atualize e confira a nova versão antes de aprovar.',409)
    await this.store.rows(`UPDATE workspace_documents SET review_status=$3,version=$4,reviewed_version=$4,reviewed_by=$5,review_note=$6,updated_at=now()
      WHERE id=$1 AND context_id=$2`,[doc.id,context.id,input.status,version,this.actor.userId,input.note])
    await this.store.activity(context.id,this.actor.userId,'document.reviewed',`Conferência documental: ${{review:'em análise',approved:'aprovado',rejected:'rejeitado'}[input.status]}`,null,{documentId:doc.id,version})
    return{ok:true}
  }
  async upload(key:ContextKey,input:{requestId:string;name:string;mimeType:string;typeLabel:string;bytes:Uint8Array;source?:unknown;parentId?:string}){
    const account=await this.connected(),{context,folder:root}=await this.folder(key)
    const folder=input.parentId&&input.parentId!==root.id?await this.google.file(input.parentId):root
    if(folder.trashed||folder.mimeType!==FOLDER_MIME||folder.capabilities?.canAddChildren!==true||(folder.id!==root.id&&!await this.google.withinFolder(folder,root.id)))throw new WorkspaceError('Você só pode enviar arquivos para uma pasta autorizada deste projeto.',403)
    if(!input.bytes.length||input.bytes.length>15000000)throw new WorkspaceError('Escolha um arquivo de até 15 MB.',413)
    const {createHash}=await import('node:crypto')
    const payload={name:input.name,mimeType:input.mimeType,typeLabel:input.typeLabel,...(input.parentId?{parentId:folder.id}:{}),hash:createHash('sha256').update(input.bytes).digest('hex'),source:input.source??null}
    return this.store.operation(this.actor,context.id,'upload_file',input.requestId,payload,account.google_sub,async()=>{
      const file=await this.google.createFile(input.name,input.mimeType,folder.id,context.id,input.bytes)
      if(!file.id)throw new WorkspaceError('O Google não confirmou o arquivo. Confira a pasta antes de repetir.',502,true)
      let document
      try{document=await this.registerDocument(key,file.id,input.typeLabel)}
      catch{throw new WorkspaceError('Arquivo salvo no Drive, mas o registro da conferência não foi confirmado. Atualize a pasta e registre o arquivo existente.',502,true)}
      return{id:file.id,document}
    })
  }
  async saveAttachment(key:ContextKey,input:{requestId:string;threadId:string;messageId:string;attachmentId:string;typeLabel:string}){
    const thread=await this.thread(key,input.threadId)
    const attachment=thread.messages.find((m:Row)=>m.id===input.messageId)?.attachments.find((a:Row)=>a.id===input.attachmentId)
    if(!attachment)throw new WorkspaceError('Anexo não encontrado nesta conversa.',404)
    if(attachment.size>15000000)throw new WorkspaceError('O anexo excede o limite de 15 MB.',413)
    const bytes=await this.google.attachment(input.messageId,input.attachmentId)
    return this.upload(key,{requestId:input.requestId,name:attachment.name,mimeType:attachment.mimeType,typeLabel:input.typeLabel,bytes,
      source:{threadId:input.threadId,messageId:input.messageId,attachmentId:input.attachmentId}})
  }
  async meetings(key:ContextKey){
    const account=await this.connected(),{context}=await this.load(key)
    const links=await this.store.links(context.id,this.actor.userId,'event',account.google_sub),events=[]
    for(const link of links){
      try{const event=eventView(await this.google.event(link.metadata.calendarId,link.remote_id),link.metadata.calendarId);events.push({...event,meetingId:link.id,outcome:link.metadata.commercialOutcome||null})}
      catch(e){if(e instanceof WorkspaceError&&[403,404].includes(e.status)){events.push({...link.metadata,id:link.remote_id,unavailable:true});continue}throw e}
    }
    return{items:events.sort((a,b)=>String(b.start).localeCompare(String(a.start)))}
  }
  async recordMeetingOutcome(key:ContextKey,input:{requestId:string;meetingId:string;status:MeetingOutcome;note:string;version:number}){
    const account=await this.connected(),{context}=await this.load(key)
    const link=(await this.store.rows(`SELECT * FROM workspace_links WHERE id=$1 AND context_id=$2
      AND user_id=$3 AND google_sub=$4 AND kind='event'`,[input.meetingId,context.id,this.actor.userId,account.google_sub]))[0]
    if(!link)throw new WorkspaceError('Reunião não encontrada na sua agenda deste projeto.',404)
    return this.store.operation(this.actor,context.id,'meeting_outcome',input.requestId,input,account.google_sub,async()=>{
      const event=await this.google.event(link.metadata.calendarId,link.remote_id)
      if(['completed','no_show'].includes(input.status)&&(!Number.isFinite(Date.parse(event.end?.dateTime||''))||Date.parse(event.end.dateTime)>Date.now()))
        throw new WorkspaceError('Registre a realização ou ausência depois do horário final da reunião.')
      const outcome={status:input.status,note:input.note,version:input.version+1,recordedAt:new Date().toISOString(),recordedBy:this.actor.userId}
      const updated=await this.store.rows(`WITH changed AS (
        UPDATE workspace_links SET metadata=jsonb_set(metadata,'{commercialOutcome}',$5::jsonb),updated_at=now()
        WHERE id=$1 AND context_id=$2 AND user_id=$3 AND kind='event'
        AND COALESCE(metadata->'commercialOutcome'->>'version','0')=$4::text RETURNING metadata
      ), audit AS (
        INSERT INTO workspace_activity(context_id,actor_id,private_user_id,action,summary,detail)
        SELECT $2,$3,$3,'meeting.outcome','Resultado da reunião registrado',jsonb_build_object('meetingId',$1::text)
        FROM changed
      ) SELECT metadata FROM changed`,[link.id,context.id,this.actor.userId,String(input.version),JSON.stringify(outcome)])
      if(!updated.length)throw new WorkspaceError('O resultado mudou. Atualize a agenda antes de salvar novamente.',409)
      return{outcome}
    })
  }
  async meeting(key:ContextKey,input:{requestId:string;calendarId:string;title:string;description:string;start:string;end:string;attendees:string[];timeZone:string}){
    const account=await this.connected(),{client,context}=await this.load(key),dates=validateMeeting(input.start,input.end)
    const calendars=await this.google.calendars(),calendar=calendars.find(c=>c.id===input.calendarId||(input.calendarId==='primary'&&c.primary))
    if(!calendar)throw new WorkspaceError('Selecione um calendário em que sua conta possa criar reuniões.',403)
    if(calendar.conferenceProperties?.allowedConferenceSolutionTypes&&!calendar.conferenceProperties.allowedConferenceSolutionTypes.includes('hangoutsMeet'))throw new WorkspaceError('Este calendário não permite criar Google Meet.',409)
    const attendees=Array.from(new Set(input.attendees.map(emailAddress)))
    if(attendees.some(e=>!client.emails.includes(e)&&!e.endsWith(`@${account.domain}`)))throw new WorkspaceError('Cadastre os convidados externos nos contatos deste cliente antes de convidar.',403)
    const description=[input.description,`Cliente: ${client.name}`,`CNPJ: ${key.cnpj}`,`Projeto: ${key.projectKind} ${key.projectKey}`,
      `${process.env.NEXTAUTH_URL||'https://projete.projetus.org'}/lead/${key.cnpj}`].filter(Boolean).join('\n')
    return this.store.operation(this.actor,context.id,'create_meeting',input.requestId,input,account.google_sub,async()=>{
      const event=await this.google.createMeeting({...input,...dates,description,attendees,contextId:context.id})
      const view=eventView(event,input.calendarId)
      await this.store.link(context.id,this.actor.userId,'event',view.id,view,account.google_sub)
      await this.store.activity(context.id,this.actor.userId,'meeting.created','Reunião agendada com convites Google',this.actor.userId)
      return view
    })
  }
}
function docView(d:Row){return{id:d.id,fileId:d.file_id,name:d.name,mimeType:d.mime_type,version:d.version,typeLabel:d.type_label,status:d.review_status,note:d.review_note??'',reviewedVersion:d.reviewed_version}}
export function threadRelates(thread:Row,emails:string[]){
  const expected=new Set(contactEmails(emails.map(email=>({email}))))
  return(thread.messages??[]).some((m:Row)=>[m.from,m.to,m.cc].some((h:unknown)=>headerEmails(String(h??'')).some(e=>expected.has(e))))
}
export function headerEmails(header:string){
  // Split outside quoted display names; never treat an address in a display name as a mailbox.
  const parts=header.match(/(?:"(?:[^"\\]|\\.)*"|[^,])+/g)??[]
  const candidates=parts.map(part=>part.match(/<([^<>]+)>/)?.[1]??part.replace(/\([^)]*\)/g,''))
  return candidates.flatMap(v=>{try{return[emailAddress(v.trim())]}catch{return[]}})
}
