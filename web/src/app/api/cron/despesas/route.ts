import { NextRequest,NextResponse } from 'next/server'
import { requireCron } from '@/lib/finance/access'
import { financeRuntime } from '@/lib/finance/runtime'
import { expenseRuntime,expenseFailure,PRIVATE_HEADERS } from '@/lib/expenses/api'
import { exportExpense } from '@/lib/expenses/integration'
export const dynamic='force-dynamic'
export const maxDuration=300
export async function GET(req:NextRequest){try{
  requireCron(req)
  const store=expenseRuntime(),p=await store.policy()
  if(!p.enabled||!p.exportsEnabled)return NextResponse.json({skipped:true},{headers:PRIVATE_HEADERS})
  await store.rows(`UPDATE finance_jobs j SET status='uncertain',last_error='Processamento interrompido; confira o lançamento no Conta Azul.',updated_at=now()
    FROM expense_requests r WHERE r.tenant_key=$1 AND j.entry_id=r.finance_entry_id
    AND r.policy ? 'accountingIds' AND j.status='processing' AND j.started_at<now()-interval '5 minutes'`,[store.tenant])
  const pending=await store.rows(`SELECT r.id FROM expense_requests r JOIN finance_jobs j ON j.entry_id=r.finance_entry_id WHERE r.tenant_key=$1 AND r.status='released' AND j.status='pending' AND NOT COALESCE(r.policy ? 'accountingIds',false) ORDER BY r.released_at LIMIT 10`,[store.tenant])
  const results=[]
  for(const r of pending)results.push(await exportExpense(store,financeRuntime().contaAzul,r.id))
  const failed=results.some(r=>'failed' in r&&(r.failed>0||r.uncertain>0))
  return NextResponse.json({results},{status:failed?207:200,headers:PRIVATE_HEADERS})
}catch(e){return expenseFailure(e)}}
