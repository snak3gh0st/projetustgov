import type { ContaAzulClient } from '../finance/providers.ts'
import { normalizeContaAzul } from '../finance/providers.ts'
import { FinanceEngine } from '../finance/engine.ts'
import { FinanceError } from '../finance/domain.ts'
import { ExpenseStore } from './store.ts'
import type { Actor } from './domain.ts'

export async function exportExpense(store:ExpenseStore,client:ContaAzulClient,id:string,actor?:Actor){
  const p=await store.policy(),settings=await store.settings()
  const r=(await store.rows('SELECT * FROM expense_requests WHERE tenant_key=$1 AND id=$2',[store.tenant,id]))[0]
  if(!r||r.status!=='released'||!r.finance_entry_id)throw new FinanceError('Solicitação sem liberação financeira.',409)
  if(actor&&(!p.financeIds.includes(actor.userId)||actor.userId===r.requester_id))throw new FinanceError('Envio restrito ao Financeiro responsável, sem conflito.',403)
  if(!p.enabled||!p.exportsEnabled||!settings.writesEnabled)return {skipped:true,reason:'Integração de despesas ou envios financeiros desativados. O lançamento permanece na fila.'}
  const result=await new FinanceEngine(store).push(client,r.finance_entry_id)
  return result
}
export async function retryExpense(store:ExpenseStore,id:string,a:Actor){
  return store.transaction(async c=>{
    a=await store.actor(c,a)
    const r=await store.get(id,a,c,true),p=await store.policy(c)
    if(!p.financeIds.includes(a.userId)||r.requester_id===a.userId||r.status!=='released')throw new FinanceError('Ação restrita ao Financeiro responsável.',403)
    const job=(await c.query("UPDATE finance_jobs SET status='pending',last_error=NULL,updated_at=now() WHERE tenant_key=$1 AND entry_id=$2 AND status='failed' RETURNING id",[store.tenant,r.finance_entry_id])).rows[0]
    if(!job)throw new FinanceError('Somente falhas confirmadas podem ser reenviadas. Resultados incertos exigem conciliação.',409)
    await store.history(c,r,a,'integration.retry','Reenvio de falha confirmada')
  })
}
export async function reconcileExpense(store:ExpenseStore,client:ContaAzulClient,id:string,remoteId:string,a:Actor){
  const r=await store.get(id,a),p=await store.policy()
  if(!p.financeIds.includes(a.userId)||r.requester_id===a.userId||r.status!=='released')throw new FinanceError('Conciliação restrita ao Financeiro responsável.',403)
  const engine=new FinanceEngine(store);await engine.checkAccount(client)
  const entry=(await store.rows('SELECT *,due_date::text FROM finance_entries WHERE tenant_key=$1 AND id=$2',[store.tenant,r.finance_entry_id]))[0]
  const items=await client.listEntries('payable',String(entry.due_date).slice(0,10),String(entry.due_date).slice(0,10))
  const item=items.find(row=>row.id===remoteId)
  if(!item)throw new FinanceError('Parcela não encontrada no vencimento da liberação.',404)
  return engine.reconcile(normalizeContaAzul(item,await client.detail(remoteId),'payable'),a.userId,entry.id)
}
