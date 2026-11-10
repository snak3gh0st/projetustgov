import { FinanceError } from './domain.ts'
import { ContaAzulClient } from './providers.ts'
import { FinanceEngine } from './engine.ts'
import type { FinanceStore } from './store.ts'

/** Read adapter over the existing BI mirror. Never contacts Conta Azul. */
export class ContaAzulMirrorClient extends ContaAzulClient {
  store: FinanceStore
  private context: Record<string,any> | null = null
  private details = new Map<string,Record<string,any>>()

  constructor(store:FinanceStore){
    super(async()=>{throw new FinanceError('O espelho financeiro é somente leitura.',409)})
    this.store=store
  }

  async freshness(){
    if(this.context)return this.context
    const c=(await this.store.rows(`SELECT id,status,metadata->'company' company FROM conta_azul_connections WHERE tenant_key=$1`,[this.store.tenant]))[0]
    if(!c)throw new FinanceError('Conecte a Conta Azul e conclua a sincronização do BI financeiro antes de importar o espelho.',409)
    const running=(await this.store.rows(`SELECT id FROM conta_azul_sync_runs WHERE connection_id=$1 AND direction='pull' AND status='running' LIMIT 1`,[c.id]))[0]
    if(running)throw new FinanceError('O BI financeiro está sincronizando. Aguarde a conclusão para atualizar a operação.',409)
    const run=(await this.store.rows(`SELECT id,status,finished_at::text,metadata FROM conta_azul_sync_runs WHERE connection_id=$1 AND direction='pull'
      ORDER BY started_at DESC LIMIT 1`,[c.id]))[0]
    if(!run?.finished_at)throw new FinanceError('O espelho Conta Azul ainda não tem uma sincronização finalizada.',409)
    this.context={connectionId:c.id,company:c.company,connectionStatus:c.status,runId:run.id,
      source:'conta_azul_mirror',mirrorUpdatedAt:run.finished_at,mirrorRunStatus:run.status,mirrorConferencia:run.metadata?.conferencia??null}
    return this.context
  }

  override async accountIdentity(){
    const {company}=await this.freshness()
    if(!company?.id_empresa||!company?.documento)throw new FinanceError('Confira a identificação da empresa na conexão Conta Azul.',409)
    return `${company.id_empresa}:${String(company.documento).replace(/\D/g,'')}`
  }

  override async listEntries(kind:'receivable'|'payable',from:string,to:string){
    const context=await this.freshness()
    const rows=await this.store.rows(`SELECT p.id,p.busca_payload,p.payload,p.descricao,p.data_vencimento::text,p.data_competencia::text,
      p.status_busca,p.status,p.valor_total,p.valor_pago,p.nao_pago,p.pessoa_id,p.pessoa_nome
      FROM conta_azul_parcelas p WHERE p.connection_id=$1 AND p.tipo=$2 AND p.deleted_at IS NULL
      AND p.data_vencimento BETWEEN $3 AND $4 ORDER BY p.id`,[context.connectionId,kind==='receivable'?'RECEITA':'DESPESA',from,to])
    return rows.map(r=>{
      const detail=r.payload??{}
      this.details.set(r.id,detail)
      return{...r.busca_payload,id:r.id,descricao:r.descricao,data_vencimento:r.data_vencimento,data_competencia:r.data_competencia,
        status_traduzido:r.status_busca??r.status,total:r.valor_total,pago:r.valor_pago,nao_pago:r.nao_pago,
        [kind==='receivable'?'cliente':'fornecedor']:{id:r.pessoa_id,nome:r.pessoa_nome}}
    })
  }

  override async detail(id:string){
    if(!this.details.has(id))throw new FinanceError('Parcela ausente do espelho importado.',404)
    return this.details.get(id)!
  }

  async finishCopy(){
    const context=await this.freshness(),s=this.store
    const latest=(await s.rows(`SELECT id,status FROM conta_azul_sync_runs WHERE connection_id=$1 AND direction='pull' ORDER BY started_at DESC LIMIT 1`,[context.connectionId]))[0]
    if(latest?.id!==context.runId||latest.status==='running')throw new FinanceError('O espelho mudou durante a importação. Atualize novamente após a sincronização.',409)
    await s.rows(`UPDATE finance_entries e SET status='canceled',updated_at=now() FROM conta_azul_parcelas p
      WHERE e.tenant_key=$1 AND e.remote_id=p.id AND p.connection_id=$2 AND p.deleted_at IS NOT NULL`,[s.tenant,context.connectionId])
  }
}

export async function refreshFromMirror(engine:FinanceEngine,mirror:ContaAzulMirrorClient,from:string,to:string){
  const context=await mirror.freshness()
  return engine.pull(mirror,from,to,context)
}
