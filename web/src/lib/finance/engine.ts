import { businessDate, csvCell, FinanceError, isoDate, normalizeHotmart, summarizeReport } from './domain.ts'
import { ContaAzulClient, HotmartClient, normalizeContaAzul, ProviderError } from './providers.ts'
import { FinanceStore } from './store.ts'

type Row=Record<string,any>
export class FinanceEngine {
  store:FinanceStore
  constructor(store:FinanceStore){this.store=store}

  async checkAccount(client:ContaAzulClient){
    const fingerprint=await client.accountIdentity(),s=this.store
    await s.transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`finance-account:${s.tenant}`])
      const r=(await c.query('SELECT settings FROM finance_settings WHERE tenant_key=$1 FOR UPDATE',[s.tenant])).rows[0]
      if(r?.settings?.accountFingerprint&&r.settings.accountFingerprint!==fingerprint)throw new FinanceError('A empresa conectada mudou. A sincronização foi bloqueada para preservar os registros desta operação.',409)
      if(!r?.settings?.accountFingerprint)await c.query(`INSERT INTO finance_settings(tenant_key,settings) VALUES($1,$2)
        ON CONFLICT(tenant_key) DO UPDATE SET settings=finance_settings.settings || EXCLUDED.settings,updated_at=now()`,[s.tenant,{accountFingerprint:fingerprint}])
    })
    return fingerprint
  }

  async run<T>(provider:string,scope:Row,fn:(lease:{assertCurrent:()=>Promise<void>})=>Promise<T>):Promise<T>{
    const s=this.store
    // Durable uniqueness works with production PgBouncer transaction pooling.
    // No session advisory lock or checked-out connection survives provider I/O.
    await s.rows(`UPDATE finance_runs SET status='failed',error='Execução interrompida: sem atividade por 30 minutos.',finished_at=now()
      WHERE tenant_key=$1 AND provider=$2 AND status='running' AND heartbeat_at<now()-interval '30 minutes'`,[s.tenant,provider])
    let id:string
    try{id=(await s.rows(`INSERT INTO finance_runs(tenant_key,provider,status,scope) VALUES($1,$2,'running',$3) RETURNING id`,[s.tenant,provider,scope]))[0].id}
    catch(e){if((e as {code?:string})?.code==='23505')throw new FinanceError('Já existe uma sincronização desta origem em andamento.',409);throw e}
    let lost=false
    const beat=async()=>{
      const rows=await s.rows("UPDATE finance_runs SET heartbeat_at=now() WHERE id=$1 AND tenant_key=$2 AND status='running' RETURNING id",[id,s.tenant])
      if(!rows.length)lost=true
    }
    const assertCurrent=async()=>{
      if(lost)throw new FinanceError('A execução perdeu sua autorização. Conferir o histórico antes de continuar.',409)
      await beat()
      if(lost)throw new FinanceError('A execução foi encerrada por outro processo.',409)
    }
    const heartbeat=setInterval(()=>{void beat().catch(()=>{lost=true})},20000)
    try{
      const result=await fn({assertCurrent})
      await assertCurrent()
      await s.rows("UPDATE finance_runs SET status='completed',item_count=$2,finished_at=now() WHERE id=$1 AND status='running'",[id,Number((result as Row)?.count??0)])
      return result
    }catch(error){
      await s.rows("UPDATE finance_runs SET status='failed',error=$2,finished_at=now() WHERE id=$1 AND status='running'",[id,error instanceof Error?error.message:'Falha na integração'])
      throw error
    }finally{clearInterval(heartbeat)}
  }

  async importHotmart(client:HotmartClient,from:string,to:string){
    return this.run('hotmart',{from,to},async()=>{
      const started=Date.now(),items=await client.history(from,to)
      let count=0
      for(const item of items){
        if(['APPROVED','COMPLETE'].includes(item.purchase?.status))item.commissions=await client.commissions(item.purchase.transaction)
        // History has no refund timestamp. A stable status-specific ID makes replay safe;
        // timestamp the observation, while newer webhooks and terminal refund rules win.
        const p=normalizeHotmart({id:`history:${item.purchase?.transaction}:${item.purchase?.status}`,creation_date:started,data:item})
        await this.store.ingestHotmart(p);count++
      }
      return{count}
    })
  }

  async pull(client:ContaAzulClient,from:string,to:string,source:Row={}){
    isoDate(from);isoDate(to)
    if(from>to)throw new FinanceError('Intervalo de sincronização inválido.')
    return this.run('conta_azul_pull',{from,to,...source},async()=>{
      await this.checkAccount(client)
      let count=0
      for(const kind of ['receivable','payable'] as const){
        const items=await client.listEntries(kind,from,to)
        for(const item of items){
          const detail=await client.detail(item.id)
          await this.reconcile(normalizeContaAzul(item,detail,kind));count++
        }
      }
      if('finishCopy' in client&&typeof client.finishCopy==='function')await client.finishCopy()
      return{count}
    })
  }

  async reconcile(remote:ReturnType<typeof normalizeContaAzul>,actor:string|null=null,explicitId?:string){
    const s=this.store
    return s.transaction(async c=>{
      // Serialize note-based recovery and direct response persistence for the same entry.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`finance-remote:${s.tenant}:${remote.remoteId}`])
      const linked=(await c.query('SELECT * FROM finance_entries WHERE tenant_key=$1 AND remote_id=$2 FOR UPDATE',[s.tenant,remote.remoteId])).rows[0]
      const localId=explicitId??remote.localEntryId
      let local=localId?(await c.query('SELECT * FROM finance_entries WHERE tenant_key=$1 AND id=$2 FOR UPDATE',[s.tenant,localId])).rows[0]:null
      const matches=local && local.kind===remote.kind && Number(local.amount_cents)===remote.amountCents
        && String(local.due_date.toISOString?.().slice(0,10)??local.due_date)===remote.dueDate
        && local.remote_person_id && local.remote_person_id===remote.remotePersonId
        && (!local.remote_id||local.remote_id===remote.remoteId)
      if(explicitId&&!matches)throw new FinanceError('O título externo não corresponde a tipo, valor, vencimento e pessoa do lançamento local.',409)
      if(!matches)local=null
      if(local&&linked&&linked.id!==local.id){
        if(linked.origin!=='conta_azul')throw new FinanceError('Parcela já vinculada a outro lançamento.',409)
        await c.query('DELETE FROM finance_entries WHERE tenant_key=$1 AND id=$2',[s.tenant,linked.id])
      }
      const id=local?.id??linked?.id
      const values=[s.tenant,remote.remoteId,remote.eventId,remote.description,remote.customerName,remote.remotePersonId,
        remote.amountCents,remote.settledCents,remote.dueDate,remote.competenceDate,remote.status,remote.paidDate,JSON.stringify(remote.payments)]
      let entryId=id
      if(id){
        await c.query(`UPDATE finance_entries SET remote_id=$2,remote_event_id=$3,description=$4,customer_name=$5,remote_person_id=$6,
          amount_cents=$7,settled_cents=$8,due_date=$9,competence_date=$10,status=$11,paid_date=$12,payments=$13,synced_at=now(),updated_at=now()
          WHERE tenant_key=$1 AND id=$14`,[...values,id])
      }else{
        entryId=(await c.query(`INSERT INTO finance_entries(tenant_key,origin,source_ref,remote_id,remote_event_id,description,customer_name,remote_person_id,
          amount_cents,settled_cents,due_date,competence_date,status,paid_date,payments,synced_at,kind)
          VALUES($1,'conta_azul',$14,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$15) RETURNING id`,[...values,`conta_azul:${remote.remoteId}`,remote.kind])).rows[0].id
      }
      await c.query("UPDATE finance_jobs SET status='done',last_error=NULL,updated_at=now() WHERE tenant_key=$1 AND entry_id=$2",[s.tenant,entryId])
      if(local?.closing_id||linked?.closing_id){
        const e=local??linked
        await c.query(`UPDATE finance_commissions SET status=$4,updated_at=now() WHERE tenant_key=$1 AND closing_id=$2 AND beneficiary_id=$3 AND status IN ('approved','paid')`,
          [s.tenant,e.closing_id,e.beneficiary_id,remote.status==='paid'?'paid':'approved'])
      }
      if(actor||local)await s.audit(c,actor,'entry.reconciled',entryId,{remoteId:remote.remoteId})
      return{entryId}
    })
  }

  async push(client:ContaAzulClient,expenseEntryId?:string){
    const s=this.store,settings=await s.settings()
    if(!settings.writesEnabled||!settings.companyConfirmed)throw new FinanceError('Envios desabilitados. Configure e confirme a empresa da Conta Azul antes de habilitar.',409)
    return this.run('conta_azul_push',{},async({assertCurrent})=>{
      await this.checkAccount(client)
      await s.rows(`UPDATE finance_jobs SET status='uncertain',last_error='Processamento interrompido; conciliar antes de reenviar.',updated_at=now()
        WHERE tenant_key=$1 AND status='processing' AND started_at<now()-interval '5 minutes'`,[s.tenant])
      let count=0,failed=0,uncertain=0
      for(let i=0;i<20;i++){
        await assertCurrent()
        const job=await s.transaction(async c=>(await c.query(`UPDATE finance_jobs SET status='processing',attempts=attempts+1,started_at=now(),updated_at=now()
          WHERE id=(SELECT j.id FROM finance_jobs j JOIN finance_entries e ON e.id=j.entry_id
            WHERE j.tenant_key=$1 AND j.status='pending'
            AND ${expenseEntryId?'e.id=$2 AND e.source_ref LIKE \'expense:%\'':"e.source_ref NOT LIKE 'expense:%'"}
            ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED) RETURNING *`,expenseEntryId?[s.tenant,expenseEntryId]:[s.tenant])).rows[0])
        if(!job)break
        let attempted=false
        try{
          const entry=(await s.rows(`SELECT e.*,e.due_date::text,e.competence_date::text,s.customer_document,s.customer_email,
            s.status sale_status,s.needs_review FROM finance_entries e LEFT JOIN finance_sales s ON s.id=e.sale_id
            WHERE e.tenant_key=$1 AND e.id=$2`,[s.tenant,job.entry_id]))[0]
          if(entry.remote_id){await s.rows("UPDATE finance_jobs SET status='done',updated_at=now() WHERE id=$1",[job.id]);continue}
          if(!['open','partial'].includes(entry.status)||entry.needs_review||(entry.sale_id&&entry.sale_status!=='active'))throw new FinanceError('Lançamento ou venda em conferência; revise antes do envio.')
          if(!entry.remote_person_id&&entry.kind==='receivable'){
            entry.remote_person_id=await client.resolveCustomer(entry)
            await s.rows('UPDATE finance_entries SET remote_person_id=$3 WHERE tenant_key=$1 AND id=$2',[s.tenant,entry.id,entry.remote_person_id])
          }
          if(!entry.remote_person_id)throw new FinanceError('Vincule o beneficiário a um fornecedor da Conta Azul.')
          const existing=await client.listEntries(entry.kind,entry.due_date,entry.due_date)
          if(existing.some((r:Row)=>(r.cliente??r.fornecedor)?.id===entry.remote_person_id&&Number(r.total)===Number(entry.amount_cents)/100)){
            throw new FinanceError('Há título com a mesma pessoa, valor e vencimento na Conta Azul. Confira e vincule o lançamento existente antes de enviar.',409)
          }
          await assertCurrent()
          attempted=true
          const remote=await client.createEntry(entry,settings)
          await s.transaction(async c=>{
            await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`finance-remote:${s.tenant}:${remote.installmentId}`])
            const imported=(await c.query('SELECT id,origin FROM finance_entries WHERE tenant_key=$1 AND remote_id=$2 FOR UPDATE',[s.tenant,remote.installmentId])).rows[0]
            if(imported&&imported.id!==entry.id){
              if(imported.origin!=='conta_azul')throw new FinanceError('Parcela externa já vinculada a outro título.',409)
              await c.query('DELETE FROM finance_entries WHERE tenant_key=$1 AND id=$2',[s.tenant,imported.id])
            }
            await c.query('UPDATE finance_entries SET remote_id=$3,remote_event_id=$4,synced_at=now(),updated_at=now() WHERE tenant_key=$1 AND id=$2',[s.tenant,entry.id,remote.installmentId,remote.eventId])
            await c.query("UPDATE finance_jobs SET status='done',last_error=NULL,updated_at=now() WHERE id=$1",[job.id])
            await s.audit(c,null,'entry.exported',entry.id,{remoteId:remote.installmentId})
          });count++
        }catch(error){
          const unknown=error instanceof ProviderError?error.uncertain:attempted
          await s.rows('UPDATE finance_jobs SET status=$2,last_error=$3,updated_at=now() WHERE id=$1',
            [job.id,unknown?'uncertain':'failed',error instanceof Error?error.message:'Falha de envio'])
          unknown?uncertain++:failed++
        }
      }
      return{count,failed,uncertain}
    })
  }

  async report(date=businessDate()){
    isoDate(date)
    const s=this.store
    const [rows,runs,review]=await Promise.all([
      s.rows('SELECT e.*,e.due_date::text,e.competence_date::text,e.paid_date::text,e.invoice_date::text FROM finance_entries e WHERE tenant_key=$1 ORDER BY e.due_date,e.id',[s.tenant]),
      s.rows('SELECT DISTINCT ON (provider) * FROM finance_runs WHERE tenant_key=$1 ORDER BY provider,started_at DESC',[s.tenant]),
      s.rows('SELECT count(*)::int count FROM finance_sales WHERE tenant_key=$1 AND needs_review IS NOT NULL',[s.tenant]),
    ])
    const summary=summarizeReport(rows.map(e=>({origin:e.remote_id?'conta_azul':e.origin,kind:e.kind,amountCents:Number(e.amount_cents),settledCents:Number(e.settled_cents),dueDate:e.due_date,status:e.status,payments:e.payments})),date)
    const pull=runs.find(r=>r.provider==='conta_azul_pull')
    const sourceStamp=pull?.scope?.mirrorUpdatedAt??pull?.finished_at??null
    const warnings:string[]=[]
    if(!pull)warnings.push('Conta Azul ainda não sincronizada. Totais confirmados podem estar incompletos.')
    else if(pull.status!=='completed'||(pull.scope?.mirrorRunStatus&&pull.scope.mirrorRunStatus!=='completed'))warnings.push('A última leitura da Conta Azul não foi concluída. Há dados parciais ou desatualizados.')
    else if(Date.now()-new Date(sourceStamp).getTime()>86400000)warnings.push('Dados Conta Azul sem atualização há mais de 24 horas.')
    if(pull?.scope?.connectionStatus&&pull.scope.connectionStatus!=='active')warnings.push('Conexão Conta Azul expirada ou desativada; os valores refletem o último espelho disponível.')
    if(review[0]?.count)warnings.push(`${review[0].count} venda(s) precisam de conferência.`)
    if(summary.unsyncedPayableCents||summary.unsyncedReceivableCents)warnings.push('Previsões locais sem vínculo estão separadas dos totais confirmados na Conta Azul.')
    if(rows.some(e=>e.remote_id&&Number(e.settled_cents)>0&&!e.payments.length))warnings.push('Há valores baixados sem detalhamento por data; não são contados nos realizados do dia.')
    return{date,generatedAt:new Date().toISOString(),summary,warnings,coverage:pull?.scope??null,lastSync:sourceStamp,
      entries:rows.map((e):Row=>({...e,amount_cents:Number(e.amount_cents),settled_cents:Number(e.settled_cents)})),runs}
  }
}

export function reportCsv(report:Awaited<ReturnType<FinanceEngine['report']>>){
  const header=['Origem','Situação ERP','Tipo','Descrição','Cliente/beneficiário','Vencimento','Valor','Baixado','Saldo','Status','Nota fiscal']
  return '\uFEFF'+[header,...report.entries.map(e=>[e.origin,e.remote_id?'Vinculado':'Previsão local',e.kind,e.description,e.customer_name,e.due_date,
    (e.amount_cents/100).toFixed(2),(e.settled_cents/100).toFixed(2),(Math.max(0,e.amount_cents-e.settled_cents)/100).toFixed(2),e.status,e.invoice_number??''])]
    .map(row=>row.map(csvCell).join(';')).join('\r\n')
}
