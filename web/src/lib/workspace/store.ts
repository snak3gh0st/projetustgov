import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { createHash } from 'node:crypto'
import { WorkspaceError, cnpjDigits, contactEmails, type ContextKey, type WorkspaceActor } from './domain.ts'

type Row=Record<string,any>
export class WorkspaceStore {
  constructor(public pool:Pool){}
  async rows<T extends QueryResultRow=Row>(sql:string,values:unknown[]=[]):Promise<T[]>{return(await this.pool.query<T>(sql,values)).rows}
  async transaction<T>(fn:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
  async sourceClient(cnpj:string){
    const digits=cnpjDigits(cnpj)
    const projects=await this.rows(`SELECT vp.id,vp.cnpj,vp.nome,vp.email,vp.tipo_servico,vp.status_contato,vp.nr_emenda,
      u.nome vendedor_nome FROM vendedor_projetos vp LEFT JOIN users u ON u.id=vp.vendedor_id
      WHERE regexp_replace(vp.cnpj,'\\D','','g')=$1 ORDER BY vp.id`,[digits])
    if(!projects.length)throw new WorkspaceError('Cliente não encontrado no CRM.',404)
    return projects
  }
  async client(cnpj:string){
    const projects=await this.sourceClient(cnpj)
    const [contacts,agreements]=await Promise.all([
      this.rows("SELECT id,nome_pessoa,cargo,email,principal FROM lead_contacts WHERE regexp_replace(lead_cnpj,'\\D','','g')=$1 ORDER BY principal DESC,id",[cnpj]),
      this.rows("SELECT nr_convenio,objeto,situacao FROM projetos_execucao WHERE regexp_replace(cnpj,'\\D','','g')=$1 ORDER BY nr_convenio",[cnpj]),
    ])
    const emails=contactEmails([...contacts,...projects])
    const ambiguous=emails.length?await this.rows(`SELECT DISTINCT lower(trim(email)) email FROM (
      SELECT lead_cnpj cnpj,email FROM lead_contacts UNION ALL SELECT cnpj,email FROM vendedor_projetos) c
      WHERE lower(trim(email))=ANY($1::text[]) AND regexp_replace(cnpj,'\\D','','g')<>$2`,[emails,cnpj]):[]
    return{cnpj,name:projects[0].nome,contacts,emails,ambiguousEmails:ambiguous.map(r=>r.email),
      projects:[{projectKind:'cliente',projectKey:'',label:'Cliente · documentos gerais'},
        ...projects.map(p=>({projectKind:'comercial',projectKey:String(p.id),label:`Comercial #${p.id} · ${p.tipo_servico||p.nr_emenda||'Aprovação'}`})),
        ...agreements.map(p=>({projectKind:'convenio',projectKey:p.nr_convenio,label:`Convênio ${p.nr_convenio} · ${p.objeto||p.situacao||''}`}))]}
  }
  async context(key:ContextKey){
    if(key.projectKind==='cliente'&&key.projectKey!=='')throw new WorkspaceError('O contexto geral do cliente não recebe uma chave de projeto.')
    if(key.projectKind!=='cliente'){
      const rows=key.projectKind==='comercial'
        ?await this.rows("SELECT 1 FROM vendedor_projetos WHERE id::text=$2 AND regexp_replace(cnpj,'\\D','','g')=$1",[key.cnpj,key.projectKey])
        :await this.rows("SELECT 1 FROM projetos_execucao WHERE nr_convenio=$2 AND regexp_replace(cnpj,'\\D','','g')=$1",[key.cnpj,key.projectKey])
      if(!rows.length)throw new WorkspaceError('Este projeto não pertence ao cliente selecionado.',403)
    }
    return(await this.rows(`INSERT INTO workspace_contexts(cnpj,project_kind,project_key) VALUES($1,$2,$3)
      ON CONFLICT(cnpj,project_kind,project_key) DO UPDATE SET cnpj=EXCLUDED.cnpj RETURNING *`,[key.cnpj,key.projectKind,key.projectKey]))[0]
  }
  async activity(contextId:string,actorId:string,action:string,summary:string,privateUserId:string|null=null,detail:Row={}){
    await this.rows('INSERT INTO workspace_activity(context_id,actor_id,action,summary,private_user_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[contextId,actorId,action,summary,privateUserId,detail])
  }
  async history(contextId:string,actorId:string){return this.rows(`SELECT a.id,a.action,a.summary,a.created_at,u.nome actor_name FROM workspace_activity a
    JOIN users u ON u.id=a.actor_id WHERE a.context_id=$1 AND (a.private_user_id IS NULL OR a.private_user_id=$2) ORDER BY a.created_at DESC LIMIT 60`,[contextId,actorId])}
  async connection(userId:string){return(await this.rows(`SELECT c.* FROM google_workspace_connections c JOIN users u ON u.id=c.user_id AND u.active WHERE c.user_id=$1`,[userId]))[0]??null}
  async safeConnection(userId:string){const c=await this.connection(userId);return c?{email:c.email,status:c.status,scopes:c.scopes,updatedAt:c.updated_at}:null}
  async saveConnection(input:{userId:string;sub:string;email:string;domain:string;access:string;refresh:string;expiresAt:Date;scopes:string[]}){
    try{
      await this.rows(`INSERT INTO google_workspace_connections(user_id,google_sub,email,domain,access_token_encrypted,refresh_token_encrypted,expires_at,scopes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET google_sub=EXCLUDED.google_sub,email=EXCLUDED.email,domain=EXCLUDED.domain,
        access_token_encrypted=EXCLUDED.access_token_encrypted,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,expires_at=EXCLUDED.expires_at,
        scopes=EXCLUDED.scopes,status='active',version=google_workspace_connections.version+1,refresh_lock=NULL,refresh_until=NULL,updated_at=now()`,
      [input.userId,input.sub,input.email,input.domain,input.access,input.refresh,input.expiresAt,input.scopes])
    }catch(e){if((e as {code?:string}).code==='23505')throw new WorkspaceError('Esta conta Google já está conectada a outro usuário da Projete.',409);throw e}
  }
  async links(contextId:string,userId:string,kind:string,googleSub:string){return this.rows(`SELECT * FROM workspace_links WHERE context_id=$1 AND user_id=$2 AND kind=$3 AND google_sub=$4 ORDER BY updated_at DESC LIMIT 50`,[contextId,userId,kind,googleSub])}
  async link(contextId:string,userId:string,kind:'thread'|'event',remoteId:string,metadata:Row,googleSub:string){
    return(await this.rows(`INSERT INTO workspace_links(context_id,user_id,kind,remote_id,metadata,google_sub) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(context_id,user_id,kind,remote_id,google_sub) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=now() RETURNING *`,[contextId,userId,kind,remoteId,metadata,googleSub]))[0]
  }
  async operation(actor:WorkspaceActor,contextId:string,kind:string,requestId:string,payload:unknown,googleSub:string,run:()=>Promise<Row>){
    const hash=createHash('sha256').update(JSON.stringify({kind,contextId,payload,googleSub})).digest('hex')
    await this.rows(`UPDATE workspace_operations SET status='uncertain',error='Operação interrompida. Confira o Google antes de repetir.',updated_at=now()
      WHERE status='processing' AND updated_at<now()-interval '5 minutes'`)
    let claimed:Row[]
    const insert=`INSERT INTO workspace_operations(request_id,user_id,context_id,kind,payload_hash,status,google_sub)
      VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT(user_id,request_id) DO NOTHING RETURNING request_id`
    const params=[requestId,actor.userId,contextId,kind,hash,googleSub]
    try{claimed=kind==='create_folder'?await this.transaction(async c=>{
      const context=(await c.query('SELECT folder_id FROM workspace_contexts WHERE id=$1 FOR UPDATE',[contextId])).rows[0]
      const previous=await c.query('SELECT 1 FROM workspace_operations WHERE user_id=$1 AND request_id=$2',[actor.userId,requestId])
      if(context?.folder_id&&!previous.rowCount)throw new WorkspaceError('O projeto já tem uma pasta vinculada.',409)
      return(await c.query(insert,params)).rows
    }):await this.rows(insert,params)}
    catch(e){if((e as {code?:string}).code==='23505')throw new WorkspaceError('Há criação de pasta em andamento ou aguardando conferência para este projeto.',409);throw e}
    if(!claimed.length){
      const old=(await this.rows('SELECT * FROM workspace_operations WHERE user_id=$1 AND request_id=$2',[actor.userId,requestId]))[0]
      if(old.payload_hash!==hash)throw new WorkspaceError('Esta solicitação já foi usada para outra operação.',409)
      if(old.status==='done')return old.response as Row
      throw new WorkspaceError(old.status==='uncertain'?'Resultado desconhecido. Confira a conta Google antes de fazer uma nova operação.':'A solicitação já está em andamento ou falhou. Atualize a tela para conferir.',409,old.status==='uncertain')
    }
    try{
      const response=await run()
      await this.rows("UPDATE workspace_operations SET status='done',response=$3,updated_at=now() WHERE user_id=$1 AND request_id=$2",[actor.userId,requestId,response])
      return response
    }catch(e){
      const uncertain=!(e instanceof WorkspaceError)||e.uncertain
      await this.rows('UPDATE workspace_operations SET status=$3,error=$4,updated_at=now() WHERE user_id=$1 AND request_id=$2',
        [actor.userId,requestId,uncertain?'uncertain':'failed',e instanceof WorkspaceError?e.message:'Falha ao registrar o resultado; confira o Google.'])
      if(!(e instanceof WorkspaceError))throw new WorkspaceError('Não foi possível registrar a confirmação. Confira o Google antes de repetir.',502,true)
      throw e
    }
  }
}
