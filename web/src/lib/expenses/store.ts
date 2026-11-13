import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Pool, PoolClient } from 'pg'
import { FinanceStore } from '../finance/store.ts'
import { FinanceError, businessDate, isoDate } from '../finance/domain.ts'
import { addBusinessDays, areaOf, canRead, chooseAuthority, editable, emptyPolicy, managesPolicy, policySchema, requestSchema, reviewers, validateFile, validateSubmission, type Actor, type Expense, type Policy, type RequestData } from './domain.ts'

type Row=Record<string,any>
export class ExpenseStore extends FinanceStore {
  constructor(pool:Pool,tenant:string){super(pool,tenant)}
  async policy(c:PoolClient|Pool=this.pool):Promise<Policy>{
    const row=(await c.query('SELECT config,version FROM expense_policies WHERE tenant_key=$1',[this.tenant])).rows[0]
    return row?{...emptyPolicy,...row.config,version:row.version}:{...emptyPolicy}
  }
  async actor(c:PoolClient,a:Actor){
    const user=(await c.query('SELECT id,role FROM users WHERE id=$1 AND active',[a.userId])).rows[0]
    if(!user)throw new FinanceError('Sessão inativa.',401)
    return {userId:user.id,role:user.role} as Actor
  }
  async savePolicy(input:unknown,version:number,actor:Actor){
    const config=policySchema.parse(input)
    return this.transaction(async c=>{
      const a=await this.actor(c,actor)
      if(!managesPolicy(a))throw new FinanceError('Somente Administração ou Diretoria configura a política.',403)
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`expense-policy:${this.tenant}`])
      const previous=await this.policy(c)
      if(previous.version!==version)throw new FinanceError('A política mudou. Atualize antes de salvar.',409)
      const ids=[...config.adminIds,...config.financeIds,...config.authorities.map(x=>x.userId),...config.areas.flatMap(x=>[x.headId,x.alternateHeadId].filter(Boolean))]
      const users=(await c.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) AND active',[ids])).rows
      if(new Set(ids).size!==users.length)throw new FinanceError('Todos os responsáveis devem ser usuários ativos.')
      await c.query(`INSERT INTO expense_policies(tenant_key,version,config,updated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT(tenant_key) DO UPDATE SET version=EXCLUDED.version,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=now()`,[this.tenant,version+1,config,a.userId])
      await c.query(`INSERT INTO expense_history(tenant_key,actor_id,action,note,snapshot) VALUES($1,$2,'policy.updated',$3,$4)`,[this.tenant,a.userId,config.reference,{previous,next:{...config,version:version+1}}])
      return {version:version+1}
    })
  }
  async get(id:string,a:Actor,c:PoolClient|Pool=this.pool,lock=false):Promise<Expense>{
    const r=(await c.query(`SELECT *,valid_until::text,due_date::text FROM expense_requests WHERE tenant_key=$1 AND id=$2 ${lock?'FOR UPDATE':''}`,[this.tenant,id])).rows[0]
    if(!r||!canRead(r,a,await this.policy(c)))throw new FinanceError('Solicitação não encontrada.',404)
    return r
  }
  async history(c:PoolClient,r:Expense,a:Actor,action:string,note='',extra:Row={}){
    const documents=(await c.query('SELECT id,type,name,mime_type,size,sha256 FROM expense_documents WHERE request_id=$1 AND removed_at IS NULL ORDER BY id',[r.id])).rows
    const h=(await c.query(`INSERT INTO expense_history(tenant_key,request_id,actor_id,action,revision,note,snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[this.tenant,r.id,a.userId,action,r.revision,note,{...r,documents,...extra}])).rows[0]
    const recipients=[r.requester_id,...reviewers(r,r.policy??await this.policy(c))].filter(id=>id!==a.userId)
    if(r.kind==='authorization'&&r.status==='approved')recipients.push(...(r.policy?.adminIds??[]).filter(id=>id!==a.userId))
    for(const id of Array.from(new Set(recipients)))await c.query(`INSERT INTO expense_notifications(tenant_key,user_id,request_id,history_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[this.tenant,id,r.id,h.id])
  }
  async create(id:string,kind:Expense['kind'],input:unknown,authorizationId:string|null,a:Actor){
    const data=requestSchema.parse(input)
    return this.transaction(async c=>{
      a=await this.actor(c,a)
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`expense-create:${id}`])
      const p=await this.policy(c)
      if(kind==='purchase'&&!p.adminIds.includes(a.userId))throw new FinanceError('A compra pela empresa deve ser registrada pelo Administrativo.',403)
      if(kind==='authorization'&&authorizationId)throw new FinanceError('Uma autorização não pode ser vinculada a outra.')
      if(authorizationId){
        const parent=await this.get(authorizationId,a,c)
        if(parent.kind!=='authorization'||parent.status!=='approved')throw new FinanceError('Selecione uma autorização aprovada.')
        if(kind==='reimbursement'&&parent.requester_id!==a.userId)throw new FinanceError('A autorização pertence a outro solicitante.',403)
      }
      if(kind==='purchase'&&!authorizationId)throw new FinanceError('A compra exige uma autorização prévia.')
      const previous=(await c.query('SELECT * FROM expense_requests WHERE id=$1',[id])).rows[0]
      if(previous){
        if(previous.tenant_key===this.tenant&&previous.requester_id===a.userId&&previous.kind===kind&&isDeepStrictEqual(previous.data,data)&&previous.authorization_id===authorizationId)return previous
        throw new FinanceError('Identificador de solicitação já utilizado.',409)
      }
      const r=(await c.query(`INSERT INTO expense_requests(id,tenant_key,requester_id,kind,data,authorization_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,this.tenant,a.userId,kind,data,authorizationId])).rows[0]
      await this.history(c,r,a,'created')
      return r
    })
  }
  async save(id:string,revision:number,input:unknown,a:Actor){
    const data=requestSchema.parse(input)
    return this.transaction(async c=>{
      a=await this.actor(c,a)
      const r=await this.get(id,a,c,true)
      this.checkRevision(r,revision)
      if(!editable(r,a))throw new FinanceError('Somente o solicitante pode editar um rascunho ou ajuste.',403)
      const next=(await c.query('UPDATE expense_requests SET data=$3,revision=revision+1,updated_at=now() WHERE tenant_key=$1 AND id=$2 RETURNING *',[this.tenant,id,data])).rows[0]
      await this.history(c,next,a,'updated')
      return next
    })
  }
  checkRevision(r:Expense,revision:number){if(r.revision!==revision)throw new FinanceError('A solicitação mudou. Atualize para conferir a versão atual.',409)}
  async documents(id:string){return this.rows('SELECT id,type,name,mime_type,size,sha256,created_at FROM expense_documents WHERE request_id=$1 AND removed_at IS NULL ORDER BY created_at',[id])}
  async attach(id:string,revision:number,file:{type:string;name:string;mime:string;bytes:Buffer},a:Actor){
    validateFile(file.bytes,file.mime)
    const sha=createHash('sha256').update(file.bytes).digest('hex')
    return this.transaction(async c=>{
      a=await this.actor(c,a)
      const r=await this.get(id,a,c,true);this.checkRevision(r,revision)
      if(!editable(r,a))throw new FinanceError('Documentos só podem ser alterados em rascunho ou ajuste pelo solicitante.',403)
      const docs=(await c.query('SELECT sha256,removed_at FROM expense_documents WHERE request_id=$1',[id])).rows
      if(docs.some(d=>d.sha256===sha&&!d.removed_at))throw new FinanceError('Este documento já está anexado.',409)
      if(docs.filter(d=>!d.removed_at).length>=10||docs.length>=30)throw new FinanceError('Limite de 10 documentos ativos e 30 versões de documentos por solicitação.')
      await c.query(`INSERT INTO expense_documents(request_id,type,name,mime_type,size,sha256,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(request_id,sha256) DO UPDATE SET removed_at=NULL,type=EXCLUDED.type WHERE expense_documents.removed_at IS NOT NULL`,[id,file.type,file.name.replace(/[\r\n\x00-\x1f]/g,'').slice(0,180)||'documento',file.mime,file.bytes.length,sha,file.bytes,a.userId])
      const next=(await c.query('UPDATE expense_requests SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id])).rows[0]
      await this.history(c,next,a,'document.added');return next
    })
  }
  async removeDocument(id:string,documentId:string,revision:number,a:Actor){
    return this.transaction(async c=>{
      a=await this.actor(c,a);const r=await this.get(id,a,c,true);this.checkRevision(r,revision)
      if(!editable(r,a))throw new FinanceError('A solicitação não permite alterar documentos.',403)
      const removed=(await c.query('UPDATE expense_documents SET removed_at=now() WHERE id=$1 AND request_id=$2 AND removed_at IS NULL RETURNING id,name,sha256,type',[documentId,id])).rows[0]
      if(!removed)throw new FinanceError('Documento não encontrado.',404)
      const next=(await c.query('UPDATE expense_requests SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id])).rows[0]
      await this.history(c,next,a,'document.removed','',{removed});return next
    })
  }
  async validateParent(c:PoolClient,r:Expense,now:Date){
    if(!r.authorization_id)return
    const parent=(await c.query('SELECT *,valid_until::text FROM expense_requests WHERE tenant_key=$1 AND id=$2 FOR UPDATE',[this.tenant,r.authorization_id])).rows[0]
    if(!parent||parent.kind!=='authorization'||parent.status!=='approved'||parent.execution_mode!==(r.kind==='purchase'?'company':'employee'))throw new FinanceError('Autorização incompatível com a modalidade desta despesa.')
    if(r.kind==='reimbursement'&&parent.requester_id!==r.requester_id)throw new FinanceError('A autorização pertence a outro solicitante.',403)
    if(parent.data.areaId!==r.data.areaId||parent.data.categoryId!==r.data.categoryId)throw new FinanceError('Área e categoria devem corresponder à autorização.')
    if(parent.valid_until&&r.data.periodEnd>String(parent.valid_until).slice(0,10))throw new FinanceError('A despesa ultrapassa a validade da autorização.')
    if(r.data.periodStart<parent.data.periodStart||r.data.periodEnd>parent.data.periodEnd)throw new FinanceError('O período realizado diverge do período autorizado.')
    const used=(await c.query(`SELECT COALESCE(sum((data->>'amountCents')::bigint),0)::text total FROM expense_requests WHERE authorization_id=$1 AND id<>$2 AND status NOT IN ('draft','changes','rejected','canceled')`,[parent.id,r.id])).rows[0]
    if(Number(used.total)+r.data.amountCents>Number(parent.approved_amount_cents))throw new FinanceError('O valor solicitado supera o saldo disponível da autorização.',409)
    if(r.kind==='purchase'&&!r.policy?.adminIds.includes(r.requester_id)&&!(await this.policy(c)).adminIds.includes(r.requester_id))throw new FinanceError('O solicitante da compra não integra o Administrativo.',403)
    void now
  }
  async checkReceipts(c:PoolClient,r:Expense){
    if(r.kind==='authorization')return
    const hashes=(await c.query("SELECT sha256 FROM expense_documents WHERE request_id=$1 AND type='receipt' AND removed_at IS NULL ORDER BY sha256",[r.id])).rows.map(d=>d.sha256)
    for(const hash of hashes){
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`expense-receipt:${this.tenant}:${hash}`])
      const duplicate=(await c.query(`SELECT 1 FROM expense_documents d JOIN expense_requests r ON r.id=d.request_id WHERE r.tenant_key=$1 AND d.sha256=$2 AND r.id<>$3 AND r.kind<>'authorization' AND r.status NOT IN ('draft','changes','rejected','canceled') LIMIT 1`,[this.tenant,hash,r.id])).rowCount
      if(duplicate)throw new FinanceError('Este comprovante já foi utilizado em outra solicitação em andamento ou liberada.',409)
    }
  }
  async command(id:string,revision:number,action:string,a:Actor,input:Row={},now=new Date()){
    return this.transaction(async c=>{
      a=await this.actor(c,a)
      // Same lock as policy writes: a submission/release uses one consistent policy version.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`expense-policy:${this.tenant}`])
      const current=await this.policy(c),r=await this.get(id,a,c,true);this.checkRevision(r,revision)
      let p=r.policy??current,status=r.status,authority=r.authority_id,protocol=r.protocol
      let approved=r.approved_amount_cents,conditions=r.approved_conditions,mode=r.execution_mode,validUntil=r.valid_until
      const note=typeof input.note==='string'?input.note.trim():''
      if(action!=='submit'&&action!=='cancel'&&note.length<10)throw new FinanceError('Registre uma justificativa de pelo menos 10 caracteres.')
      if(note.length>2000)throw new FinanceError('Justificativa muito longa.')
      if(action==='submit'){
        if(!editable(r,a))throw new FinanceError('A solicitação não pode ser enviada por este usuário.',403)
        p=current;validateSubmission(r,p,(await c.query('SELECT type FROM expense_documents WHERE request_id=$1 AND removed_at IS NULL',[id])).rows.map(d=>d.type))
        if(r.kind!=='authorization'&&r.data.periodEnd>businessDate(now))throw new FinanceError('Informe uma despesa já realizada.')
        if(r.kind==='authorization'&&r.data.periodStart<businessDate(now))throw new FinanceError('A autorização prévia exige um período ainda não iniciado. Ajuste as datas antes do envio.')
        await this.validateParent(c,{...r,policy:p},now);await this.checkReceipts(c,r)
        authority=r.kind==='authorization'?chooseAuthority(p,r.data.amountCents,r.requester_id):null
        status=r.kind==='purchase'?'finance_review':'head_review'
      }else if(action==='cancel'){
        if(r.requester_id!==a.userId||!['draft','changes'].includes(r.status))throw new FinanceError('Cancelamento permitido somente em rascunho ou ajuste.',403)
        status='canceled'
      }else{
        if(a.userId===r.requester_id||!reviewers(r,p).includes(a.userId))throw new FinanceError('Esta etapa exige outro responsável com alçada.',403)
        if(action==='return')status='changes'
        else if(action==='reject')status='rejected'
        else if(action==='approve'){
          if(r.status==='head_review')status=r.kind==='authorization'?'admin_review':'finance_review'
          else if(r.status==='admin_review'){
            authority=chooseAuthority(p,r.data.amountCents,r.requester_id);status='authority_review'
          }else if(r.status==='authority_review'){
            if(r.data.periodStart<businessDate(now))throw new FinanceError('O período solicitado já começou. Devolva para ajustar as condições antes de autorizar.')
            const decision=zDecision(input,r.data.amountCents)
            if(!p.authorities.some(x=>x.userId===a.userId&&x.limitCents>=decision.amountCents))throw new FinanceError('Valor acima da alçada do aprovador.',403)
            approved=decision.amountCents;conditions=decision.conditions;mode=decision.mode;validUntil=decision.validUntil
            if(validUntil&&validUntil<r.data.periodEnd)throw new FinanceError('A validade deve abranger o período autorizado.')
            protocol=`AUT-${businessDate(now).slice(0,4)}-${r.id.toUpperCase()}`;status='approved'
          }else if(r.status==='exception_review')status='finance_review'
          else throw new FinanceError('Use a liberação financeira para gerar o lançamento.',409)
        }else if(action==='escalate'&&r.status==='finance_review'){
          authority=chooseAuthority(p,r.data.amountCents,r.requester_id);status='exception_review'
        }else if(action==='release'&&r.status==='finance_review'){
          if(!current.enabled)throw new FinanceError('A política está suspensa.',409)
          await this.validateParent(c,r,now);await this.checkReceipts(c,r)
          const docs=(await c.query('SELECT type FROM expense_documents WHERE request_id=$1 AND removed_at IS NULL',[id])).rows.map(d=>d.type)
          validateSubmission(r,p,docs)
          const due=r.kind==='reimbursement'?addBusinessDays(now,current.holidays,current.calendarYears):r.data.paymentDueDate
          if(!due)throw new FinanceError('Informe o vencimento negociado com o fornecedor.')
          const category=p.categories.find(x=>x.id===r.data.categoryId),area=areaOf(r,p)
          if(!category?.categoryId)throw new FinanceError('Configure a categoria contábil da despesa na política.',409)
          const settings=await this.settings()
          if(!settings.companyConfirmed||!settings.financialAccountId)throw new FinanceError('Confirme a empresa e a conta financeira na operação Conta Azul.',409)
          const person=r.kind==='purchase'?r.data.supplierId:(await c.query('SELECT remote_person_id FROM finance_people WHERE tenant_key=$1 AND user_id=$2',[this.tenant,r.requester_id])).rows[0]?.remote_person_id
          if(!person)throw new FinanceError('Vincule o beneficiário a um fornecedor da Conta Azul antes de liberar.',409)
          const owner=(await c.query('SELECT nome FROM users WHERE id=$1',[r.requester_id])).rows[0]
          const entry=(await c.query(`INSERT INTO finance_entries(tenant_key,origin,source_ref,beneficiary_id,kind,description,customer_name,remote_person_id,amount_cents,due_date,competence_date,expense_config)
            VALUES($1,'projete',$2,$3,'payable',$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[this.tenant,`expense:${r.id}`,r.kind==='reimbursement'?r.requester_id:null,`${r.kind==='purchase'?'Compra':'Reembolso'} · ${r.data.title}`,owner?.nome??'',person,r.data.amountCents,due,r.data.periodEnd,{financialAccountId:settings.financialAccountId,payableCategoryId:category.categoryId,costCenterId:area?.costCenterId??null}])).rows[0]
          await c.query('INSERT INTO finance_jobs(tenant_key,entry_id) VALUES($1,$2)',[this.tenant,entry.id])
          const next=(await c.query(`UPDATE expense_requests SET status='released',revision=revision+1,released_at=$3,due_date=$4,finance_entry_id=$5,updated_at=now() WHERE tenant_key=$1 AND id=$2 RETURNING *`,[this.tenant,id,now,due,entry.id])).rows[0]
          await this.history(c,next,a,'released',note,{calendar:{years:current.calendarYears,holidays:current.holidays},policyVersion:current.version})
          await this.audit(c,a.userId,'expense.released',entry.id,{requestId:id,dueDate:due});return next
        }else throw new FinanceError('Ação incompatível com a etapa atual.',409)
      }
      const next=(await c.query(`UPDATE expense_requests SET status=$3,revision=revision+1,policy=$4,authority_id=$5,protocol=$6,approved_amount_cents=$7,approved_conditions=$8,execution_mode=$9,valid_until=$10,updated_at=now() WHERE tenant_key=$1 AND id=$2 RETURNING *`,[this.tenant,id,status,p,authority,protocol,approved,conditions,mode,validUntil])).rows[0]
      await this.history(c,next,a,action,note);return next
    })
  }
  async detail(id:string,a:Actor){
    const r=await this.get(id,a)
    const [documents,history,financial]=await Promise.all([this.documents(id),this.rows(`SELECT h.id,h.action,h.revision,h.note,h.created_at,h.snapshot->'documents' documents,h.snapshot->'data' data,h.snapshot->'policy'->'version' policy_version,h.snapshot->>'approved_conditions' approved_conditions,u.nome actor_name FROM expense_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.tenant_key=$1 AND h.request_id=$2 ORDER BY h.id`,[this.tenant,id]),r.finance_entry_id?this.rows(`SELECT e.remote_id,e.remote_event_id,e.status,e.settled_cents,e.paid_date,e.due_date,j.status integration_status,j.last_error FROM finance_entries e LEFT JOIN finance_jobs j ON j.entry_id=e.id WHERE e.tenant_key=$1 AND e.id=$2`,[this.tenant,r.finance_entry_id]):Promise.resolve([])])
    await this.rows('UPDATE expense_notifications SET seen_at=now() WHERE tenant_key=$1 AND user_id=$2 AND request_id=$3 AND seen_at IS NULL',[this.tenant,a.userId,id])
    return {request:r,documents,history,financial:financial[0]??null,actions:this.actions(r,a)}
  }
  actions(r:Expense,a:Actor){
    if(editable(r,a))return ['save','submit','cancel']
    if(a.userId===r.requester_id||!reviewers(r,r.policy??emptyPolicy).includes(a.userId))return []
    return ['return','reject',...(r.status==='finance_review'?['release','escalate']:['approve'])]
  }
  async dashboard(a:Actor){
    const p=await this.policy(),scopePolicies=JSON.stringify(p)
    // Bound by permissions in SQL before pagination; inaccessible rows cannot crowd out the owner's queue.
    const candidates=await this.rows(`SELECT r.*,u.nome requester_name,e.status payment_status,e.remote_id,j.status integration_status
      FROM expense_requests r LEFT JOIN users u ON u.id=r.requester_id LEFT JOIN finance_entries e ON e.id=r.finance_entry_id LEFT JOIN finance_jobs j ON j.entry_id=e.id
      WHERE r.tenant_key=$1 AND (r.requester_id=$2 OR (r.policy IS NOT NULL AND (
        r.authority_id=$2 OR r.policy->'adminIds' ? $2::text OR r.policy->'financeIds' ? $2::text OR $3::jsonb->'adminIds' ? $2::text OR $3::jsonb->'financeIds' ? $2::text OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(r.policy->'areas') ar WHERE ar->>'id'=r.data->>'areaId' AND (ar->>'headId'=$2::text OR ar->>'alternateHeadId'=$2::text)) OR
        EXISTS(SELECT 1 FROM jsonb_array_elements($3::jsonb->'areas') ar WHERE ar->>'id'=r.data->>'areaId' AND (ar->>'headId'=$2::text OR ar->>'alternateHeadId'=$2::text)))))
      ORDER BY r.updated_at DESC LIMIT 201`,[this.tenant,a.userId,scopePolicies])
    const requests=candidates.slice(0,200).filter(r=>canRead(r as Expense,a,p)).map(r=>({...r,actions:this.actions(r as Expense,a)}))
    const configAdmin=managesPolicy(a)
    const ids=[...p.adminIds,...p.financeIds,...p.authorities.map(x=>x.userId),...p.areas.flatMap(x=>[x.headId,x.alternateHeadId]).filter(Boolean)]
    const users=await this.rows(`SELECT id,nome ${configAdmin?',role':''} FROM users WHERE active ${configAdmin?'':'AND id=ANY($1::uuid[])'} ORDER BY nome`,configAdmin?[]:[ids])
    const notifications=await this.rows(`SELECT n.id,n.request_id,r.data->>'title' title,h.action,n.created_at FROM expense_notifications n JOIN expense_requests r ON r.id=n.request_id JOIN expense_history h ON h.id=n.history_id WHERE n.tenant_key=$1 AND n.user_id=$2 AND n.seen_at IS NULL ORDER BY n.id DESC LIMIT 30`,[this.tenant,a.userId])
    return {requests,hasMore:candidates.length>200,policy:p,configAdmin,users,notifications,actor:a}
  }
}

function zDecision(input:Row,requested:number){
  const amountCents=Number(input.amountCents)
  if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>requested)throw new FinanceError('O valor aprovado deve ser positivo e não superar o solicitado.')
  if(!['company','employee'].includes(input.mode))throw new FinanceError('Selecione a modalidade de execução.')
  if(typeof input.conditions!=='string'||input.conditions.trim().length<10||input.conditions.length>2000)throw new FinanceError('Descreva as condições aprovadas.')
  const validUntil=input.validUntil?String(input.validUntil):null
  if(validUntil)isoDate(validUntil)
  return {amountCents,mode:input.mode as 'company'|'employee',conditions:input.conditions.trim(),validUntil}
}
