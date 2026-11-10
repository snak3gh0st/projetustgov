import { WorkspaceError, emailAddress, googleId, safeGoogleUrl, type GoogleFile } from './domain.ts'

type Row=Record<string,any>
type Fetcher=typeof fetch
const FILE_FIELDS='id,name,mimeType,version,modifiedTime,webViewLink,parents,trashed,capabilities(canAddChildren,canEdit)'
export class GoogleApi {
  constructor(private token:()=>Promise<string>,private fetcher:Fetcher=fetch){}

  async request(service:'gmail'|'calendar'|'drive'|'upload',path:string,options:{method?:string;query?:Record<string,string>;body?:unknown;raw?:BodyInit;contentType?:string;mutation?:boolean}={}) {
    const base={gmail:'https://gmail.googleapis.com/gmail/v1/users/me',calendar:'https://www.googleapis.com/calendar/v3',
      drive:'https://www.googleapis.com/drive/v3',upload:'https://www.googleapis.com/upload/drive/v3'}[service]
    const url=new URL(base+path)
    for(const[k,v]of Object.entries(options.query??{}))url.searchParams.set(k,v)
    let response:Response
    try{response=await this.fetcher(url,{method:options.method??'GET',cache:'no-store',signal:AbortSignal.timeout(25000),
      headers:{Authorization:`Bearer ${await this.token()}`,Accept:'application/json',...(options.body||options.raw?{'Content-Type':options.contentType??'application/json'}:{})},
      body:options.raw??(options.body?JSON.stringify(options.body):undefined)})}
    catch(e){if(e instanceof WorkspaceError)throw e;throw new WorkspaceError(options.mutation?'O Google não confirmou a operação. Confira a conta antes de tentar novamente.':'Não foi possível consultar o Google.',502,!!options.mutation)}
    if(!response.ok){
      const message=response.status===403?'Sua conta Google não tem permissão para este recurso ou falta autorizar o acesso.'
        :response.status===401?'Reconecte sua conta Google para continuar.'
        :response.status===404?'O recurso não existe ou não está acessível na sua conta Google.'
        :response.status===429?'O Google limitou as consultas. Aguarde e tente novamente.'
        :'O Google não concluiu a operação solicitada.'
      throw new WorkspaceError(message,[401,403,404,409,429].includes(response.status)?response.status:502,!!options.mutation&&response.status>=500)
    }
    if(response.status===204)return{}
    const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0
    if(!reader)throw new WorkspaceError('O Google retornou uma resposta vazia.',502,!!options.mutation)
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>25000000){await reader.cancel();throw new WorkspaceError('O conteúdo excede o limite desta visualização.',413,!!options.mutation)}chunks.push(value)}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Row}
    catch{throw new WorkspaceError('O Google retornou uma resposta inválida.',502,!!options.mutation)}
  }
  async folders(search='',pageToken=''){
    const escaped=search.replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    return this.request('drive','/files',{query:{q:`trashed=false and mimeType='application/vnd.google-apps.folder'${escaped?` and name contains '${escaped}'`:''}`,
      fields:`files(${FILE_FIELDS}),nextPageToken`,pageSize:'30',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})}})
  }
  async file(id:string):Promise<GoogleFile>{return this.request('drive',`/files/${encodeURIComponent(googleId(id))}`,{query:{fields:FILE_FIELDS,supportsAllDrives:'true'}}) as Promise<GoogleFile>}
  async files(folderId:string,pageToken=''){
    return this.request('drive','/files',{query:{q:`'${googleId(folderId)}' in parents and trashed=false`,pageSize:'50',orderBy:'folder,name',
      fields:`files(${FILE_FIELDS}),nextPageToken`,supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})}})
  }
  async withinFolder(file:GoogleFile,folderId:string){
    const pending=[...(file.parents??[])],seen=new Set<string>()
    for(let i=0;pending.length&&i<30;i++){
      const id=pending.shift()!;if(id===folderId)return true;if(seen.has(id))continue;seen.add(id)
      const parent=await this.file(id);pending.push(...(parent.parents??[]))
    }
    return false
  }
  async createFile(name:string,mimeType:string,parent:string,contextId:string,content?:Uint8Array){
    const metadata={name,mimeType,parents:[googleId(parent)],appProperties:{projeteContext:contextId}}
    if(content){
      const boundary=`projete_${crypto.randomUUID().replaceAll('-','')}`
      const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),content,Buffer.from(`\r\n--${boundary}--\r\n`)])
      return this.request('upload','/files',{method:'POST',query:{uploadType:'multipart',fields:FILE_FIELDS,supportsAllDrives:'true'},raw:body,contentType:`multipart/related; boundary=${boundary}`,mutation:true})
    }
    return this.request('drive','/files',{method:'POST',query:{fields:FILE_FIELDS,supportsAllDrives:'true'},body:metadata,mutation:true})
  }
  async threads(query:string,pageToken=''){
    return this.request('gmail','/threads',{query:{q:query,maxResults:'20',...(pageToken?{pageToken}:{})}})
  }
  async thread(id:string){
    const data=await this.request('gmail',`/threads/${googleId(id)}`,{query:{format:'full'}})
    return normalizeThread(data)
  }
  async attachment(messageId:string,attachmentId:string){
    const r=await this.request('gmail',`/messages/${googleId(messageId)}/attachments/${googleId(attachmentId)}`)
    if(typeof r.data!=='string'||r.data.length>20000000)throw new WorkspaceError('Anexo maior que o limite de 15 MB.',413)
    return Buffer.from(r.data,'base64url')
  }
  async send(input:{from:string;to:string[];subject:string;text:string;requestId:string;threadId?:string;replyMessageId?:string;references?:string}){
    const raw=buildMime(input)
    const data=await this.request('gmail','/messages/send',{method:'POST',body:{raw,...(input.threadId?{threadId:googleId(input.threadId)}:{})},mutation:true})
    if(typeof data.id!=='string'||typeof data.threadId!=='string')throw new WorkspaceError('Envio sem confirmação. Confira a pasta Enviados no Gmail.',502,true)
    return{id:data.id,threadId:data.threadId}
  }
  async calendars(){
    const result:Row[]=[];let pageToken=''
    for(let i=0;i<20;i++){
      const r=await this.request('calendar','/users/me/calendarList',{query:{minAccessRole:'writer',maxResults:'100',...(pageToken?{pageToken}:{})}})
      result.push(...(r.items??[]));pageToken=r.nextPageToken??'';if(!pageToken)return result
    }
    throw new WorkspaceError('Há calendários demais nesta conta para carregar de uma vez.',422)
  }
  async availability(calendarId:string,start:string,end:string){
    return this.request('calendar','/freeBusy',{method:'POST',body:{timeMin:start,timeMax:end,items:[{id:googleId(calendarId)}]}})
  }
  async createMeeting(input:{requestId:string;calendarId:string;title:string;description:string;start:string;end:string;attendees:string[];contextId:string}){
    const id=`p${input.requestId.replaceAll('-','')}`
    const body={id,summary:input.title,description:input.description,start:{dateTime:input.start},end:{dateTime:input.end},
      attendees:input.attendees.map(email=>({email:emailAddress(email)})),
      extendedProperties:{private:{projeteContext:input.contextId,projeteOperation:input.requestId}},
      conferenceData:{createRequest:{requestId:input.requestId,conferenceSolutionKey:{type:'hangoutsMeet'}}}}
    let data:Row
    try{data=await this.request('calendar',`/calendars/${encodeURIComponent(googleId(input.calendarId))}/events`,{method:'POST',query:{conferenceDataVersion:'1',sendUpdates:'all'},body,mutation:true})}
    catch(e){
      if(!(e instanceof WorkspaceError&&e.status===409))throw e
      try{data=await this.event(input.calendarId,id)}catch{throw new WorkspaceError('O evento pode já existir. Confira a agenda antes de criar outra reunião.',502,true)}
      if(data.extendedProperties?.private?.projeteOperation!==input.requestId)throw new WorkspaceError('Evento já existente com outro vínculo.',409)
    }
    if(typeof data.id!=='string')throw new WorkspaceError('O Google não confirmou o evento. Confira a agenda.',502,true)
    return data
  }
  async event(calendarId:string,id:string){return this.request('calendar',`/calendars/${encodeURIComponent(googleId(calendarId))}/events/${googleId(id)}`)}
}

function oneLine(s:string){if(/[\r\n]/.test(s))throw new WorkspaceError('Cabeçalho de e-mail inválido.');return s}
export function buildMime(input:{from:string;to:string[];subject:string;text:string;requestId:string;replyMessageId?:string;references?:string}){
  const subject=oneLine(input.subject),to=input.to.map(emailAddress)
  if(!to.length)throw new WorkspaceError('Selecione ao menos um contato do cliente.')
  const words:string[]=[];let chunk=''
  for(const character of Array.from(subject)){if(Buffer.byteLength(chunk+character)>42){words.push(chunk);chunk=''}chunk+=character}
  if(chunk||!words.length)words.push(chunk)
  const encodedSubject=words.map(word=>`=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`).join('\r\n ')
  const lines=[`From: ${emailAddress(input.from)}`,`To: ${to.join(',\r\n ')}`,`Subject: ${encodedSubject}`,
    `Message-ID: <${oneLine(input.requestId)}@projete.projetus.org>`,`Date: ${new Date().toUTCString()}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64']
  if(input.replyMessageId)lines.push(`In-Reply-To: ${oneLine(input.replyMessageId)}`)
  if(input.references)lines.push(`References: ${oneLine(input.references)}`)
  const text=Buffer.from(input.text).toString('base64').match(/.{1,76}/g)?.join('\r\n')??''
  return Buffer.from([...lines,'',text].join('\r\n')).toString('base64url')
}
export function normalizeThread(thread:Row){
  const messages=(thread.messages??[]).map((m:Row)=>{
    const headers=new Map<string,string>((m.payload?.headers??[]).map((h:Row)=>[String(h.name).toLowerCase(),String(h.value)]))
    let text='',html='';const attachments:Row[]=[]
    const visit=(part:Row)=>{
      if(!part.filename&&part.body?.data&&part.body.data.length<1500000){
        if(part.mimeType==='text/plain')text+=Buffer.from(part.body.data,'base64url').toString('utf8')+'\n'
        if(part.mimeType==='text/html')html+=Buffer.from(part.body.data,'base64url').toString('utf8')+'\n'
      }
      if(part.filename&&part.body?.attachmentId)attachments.push({id:part.body.attachmentId,name:part.filename,mimeType:part.mimeType,size:Number(part.body.size??0),messageId:m.id})
      for(const p of part.parts??[])visit(p)
    };visit(m.payload??{})
    return{id:String(m.id),from:headers.get('from')??'',to:headers.get('to')??'',cc:headers.get('cc')??'',subject:headers.get('subject')??'(Sem assunto)',
      messageId:headers.get('message-id')??'',references:headers.get('references')??'',date:new Date(Number(m.internalDate)).toISOString(),
      text:text.trim()||htmlToText(html)||String(m.snippet??''),attachments}
  })
  return{id:String(thread.id),subject:messages.at(-1)?.subject??'(Sem assunto)',snippet:String(thread.snippet??''),messages,
    url:`https://mail.google.com/mail/u/0/#all/${googleId(thread.id)}`}
}
function htmlToText(html:string){
  // Output is always a React text node, never HTML. Preserve readable HTML-only email bodies.
  return html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<(?:br|hr)\b[^>]*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi,'\n').replace(/<[^>]*>/g,'')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,entity:string)=>{
      const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aacute:'á',acirc:'â',agrave:'à',atilde:'ã',eacute:'é',ecirc:'ê',iacute:'í',oacute:'ó',ocirc:'ô',otilde:'õ',uacute:'ú',uuml:'ü',ccedil:'ç'},lower=entity.toLowerCase()
      if(named[lower])return entity[0]!==lower[0]?named[lower].toUpperCase():named[lower]
      if(!lower.startsWith('#'))return match
      const number=parseInt(lower.slice(lower.startsWith('#x')?2:1),lower.startsWith('#x')?16:10)
      return Number.isFinite(number)&&number>0&&number<=0x10ffff?String.fromCodePoint(number):''
    }).replace(/[\t ]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
}
export function eventView(event:Row,calendarId:string){
  const meet=event.hangoutLink??event.conferenceData?.entryPoints?.find((p:Row)=>p.entryPointType==='video')?.uri
  return{id:event.id,calendarId,title:event.summary??'Reunião',start:event.start?.dateTime??event.start?.date,end:event.end?.dateTime??event.end?.date,
    status:event.status??'confirmed',meetUrl:safeGoogleUrl(meet),url:safeGoogleUrl(event.htmlLink),conferenceStatus:event.conferenceData?.createRequest?.status?.statusCode??null}
}
