import type { Pool, PoolClient, QueryResultRow } from 'pg'
import { FinanceError, buildSchedule, businessDate, closingDueDate, isoDate, type HotmartPurchase } from './domain.ts'

export type FinanceSettings = {
  writesEnabled: boolean; companyConfirmed: boolean; financialAccountId: string; receivableCategoryId: string
  payableCategoryId: string; reportRecipientId: string; dailyEmailEnabled: boolean; statementsEnabled: boolean
  affiliateMap: Record<string, string>
  hotmartRules: Record<string, { billingMode: 'single'|'fixed'|'subscription'; count: number; dueOffsetDays: number }>
  accountFingerprint: string
}
export const DEFAULT_SETTINGS: FinanceSettings = {
  writesEnabled: false, companyConfirmed: false, financialAccountId: '', receivableCategoryId: '', payableCategoryId: '',
  reportRecipientId: '', dailyEmailEnabled: false, statementsEnabled: false, affiliateMap: {}, hotmartRules: {}, accountFingerprint: '',
}
type Row = Record<string, any>
export type CrmSale = {
  external_key: string; customer_name: string; customer_document: string; customer_email: string
  description: string; amount_cents: number; seller_id: string | null; seller_name: string
  commission_cents: number; closer_id: string | null; closer_name: string; closer_commission_cents: number
  source_updated_at: string
}

export class FinanceStore {
  pool: Pool
  tenant: string
  constructor(pool: Pool, tenant: string) { this.pool = pool; this.tenant = tenant }

  async rows<T extends QueryResultRow = Row>(sql: string, values: unknown[] = []): Promise<T[]> {
    return (await this.pool.query<T>(sql, values)).rows
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect()
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result }
    catch (e) { await c.query('ROLLBACK'); throw e }
    finally { c.release() }
  }

  async audit(c: PoolClient, actor: string | null, action: string, entity: string | null, detail: Row = {}) {
    await c.query('INSERT INTO finance_audit(tenant_key,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [this.tenant, actor, action, entity, detail])
  }

  async settings(): Promise<FinanceSettings> {
    const row = (await this.rows('SELECT settings FROM finance_settings WHERE tenant_key=$1', [this.tenant]))[0]
    return { ...DEFAULT_SETTINGS, ...row?.settings }
  }

  async saveSettings(settings: FinanceSettings, actor: string) {
    if (settings.writesEnabled && (!settings.companyConfirmed || !settings.financialAccountId || !settings.receivableCategoryId || !settings.payableCategoryId)) {
      throw new FinanceError('Confirme a empresa e configure conta financeira e categorias antes de habilitar envios.')
    }
    if (settings.dailyEmailEnabled) {
      const u = (await this.rows("SELECT id FROM users WHERE id=$1 AND active AND role IN ('gestor','admin','gestor_financeiro')", [settings.reportRecipientId || null]))[0]
      if (!u) throw new FinanceError('Selecione um responsável financeiro ativo para receber o relatório.')
    }
    await this.transaction(async c => {
      await c.query(`INSERT INTO finance_settings(tenant_key,settings) VALUES($1,$2)
        ON CONFLICT(tenant_key) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`, [this.tenant, settings])
      await this.audit(c, actor, 'settings.updated', null, { writesEnabled: settings.writesEnabled, companyConfirmed: settings.companyConfirmed })
    })
  }

  async ingestCrmSale(input: CrmSale) {
    if (!Number.isSafeInteger(input.amount_cents) || input.amount_cents <= 0) throw new FinanceError('Venda sem valor válido.')
    return this.transaction(async c => {
      const snapshot = { sellerId: input.seller_id, closerId: input.closer_id, amountCents: input.amount_cents,
        commissionCents: input.commission_cents, closerCommissionCents: input.closer_commission_cents }
      const r = await c.query(`INSERT INTO finance_sales(tenant_key,origin,external_key,customer_name,customer_document,customer_email,description,amount_cents,snapshot,source_updated_at)
        VALUES($1,'projete',$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(tenant_key,origin,external_key) DO UPDATE SET
          needs_review=CASE WHEN (finance_sales.schedule_confirmed OR EXISTS(SELECT 1 FROM finance_commissions cm WHERE cm.sale_id=finance_sales.id AND cm.status IN ('released','approved','paid')))
            AND finance_sales.snapshot IS DISTINCT FROM EXCLUDED.snapshot
            THEN 'Venda comercial alterada após conferência; revisar calendário e comissões.' ELSE finance_sales.needs_review END,
          amount_cents=CASE WHEN finance_sales.schedule_confirmed THEN finance_sales.amount_cents ELSE EXCLUDED.amount_cents END,
          snapshot=EXCLUDED.snapshot,source_updated_at=EXCLUDED.source_updated_at,updated_at=now()
        RETURNING *`, [this.tenant, String(input.external_key), input.customer_name, input.customer_document, input.customer_email, input.description, input.amount_cents, snapshot, input.source_updated_at])
      const sale = r.rows[0]
      const roles = [
        { role: 'consultor', id: input.seller_id, name: input.seller_name, amount: input.commission_cents },
        { role: 'gestor', id: input.closer_id, name: input.closer_name, amount: input.closer_commission_cents },
      ]
      for (const role of roles) {
        if (!role.id || !Number.isSafeInteger(role.amount) || role.amount <= 0) continue
        // Stable role key: changing the beneficiary never leaves an old unpaid duplicate behind.
        await c.query(`INSERT INTO finance_commissions(tenant_key,source_ref,sale_id,beneficiary_id,beneficiary_name,role,amount_cents)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_key,source_ref) DO UPDATE
          SET amount_cents=EXCLUDED.amount_cents,beneficiary_id=EXCLUDED.beneficiary_id,beneficiary_name=EXCLUDED.beneficiary_name,updated_at=now()
          WHERE finance_commissions.status='calculated'`, [this.tenant, `projete:${input.external_key}:${role.role}`, sale.id, role.id, role.name, role.role, role.amount])
      }
      return sale
    })
  }

  async importCrm(after = 0) {
    const leads = await this.rows<CrmSale & { id: number }>(`SELECT vp.id,vp.id::text external_key,vp.nome customer_name,vp.cnpj customer_document,
      COALESCE(vp.email,'') customer_email,COALESCE(vp.tipo_servico,'Serviço Projete') description,
      ROUND(vp.valor_venda::numeric*100)::bigint amount_cents,vp.vendedor_id seller_id,COALESCE(u.nome,'Sem vendedor') seller_name,
      ROUND(COALESCE(vp.comissao_valor,0)::numeric*100)::bigint commission_cents,vp.closer_id,
      COALESCE(uc.nome,'Sem gestor') closer_name,ROUND(COALESCE(vp.closer_comissao_valor,0)::numeric*100)::bigint closer_commission_cents,
      COALESCE(vp.fechamento_at,vp.updated_at)::text source_updated_at
      FROM vendedor_projetos vp LEFT JOIN users u ON u.id=vp.vendedor_id LEFT JOIN users uc ON uc.id=vp.closer_id
      WHERE vp.status_contato='Fechado' AND vp.valor_venda>0 AND vp.id>$1 ORDER BY vp.id LIMIT 200`, [after])
    for (const lead of leads) await this.ingestCrmSale({ ...lead, amount_cents: Number(lead.amount_cents), commission_cents: Number(lead.commission_cents), closer_commission_cents: Number(lead.closer_commission_cents) })
    await this.rows(`UPDATE finance_sales s SET status='canceled',needs_review='Venda reaberta ou cancelada no CRM. Conferir financeiro e comissões.',updated_at=now()
      FROM vendedor_projetos vp WHERE s.tenant_key=$1 AND s.origin='projete' AND s.external_key=vp.id::text
      AND vp.status_contato IS DISTINCT FROM 'Fechado'`, [this.tenant])
    return { imported: leads.length, nextCursor: leads.length === 200 ? Number(leads[leads.length - 1].id) : null }
  }

  async ingestHotmart(p: HotmartPurchase) {
    const settings = await this.settings()
    const result = await this.transaction(async c => {
      const event = await c.query(`INSERT INTO finance_events(tenant_key,provider,event_id,snapshot) VALUES($1,'hotmart',$2,$3)
        ON CONFLICT DO NOTHING RETURNING event_id`, [this.tenant, p.eventId, p.snapshot])
      if (!event.rowCount) return { duplicate: true }
      const terminal = p.paymentStatus === 'refunded' ? 'refunded' : p.paymentStatus === 'canceled' ? 'canceled' : 'active'
      const result = await c.query(`INSERT INTO finance_sales(tenant_key,origin,external_key,customer_name,customer_document,customer_email,description,
        amount_cents,billing_mode,status,needs_review,snapshot,source_updated_at)
        VALUES($1,'hotmart',$2,$3,$4,$5,$6,$7,$8,$9,'Conferir modalidade, dados do comprador e calendário financeiro.',$10,$11)
        ON CONFLICT(tenant_key,origin,external_key) DO UPDATE SET
          status=CASE WHEN finance_sales.status='refunded' THEN 'refunded' ELSE EXCLUDED.status END,
          needs_review=CASE WHEN EXCLUDED.status IN ('refunded','canceled') THEN 'Estorno/cancelamento Hotmart: conferir títulos e ajustes de comissões.'
            WHEN EXCLUDED.snapshot->>'status'='PARTIALLY_REFUNDED' THEN 'Estorno parcial Hotmart: conferir valor e ajuste de comissão.' ELSE finance_sales.needs_review END,
          snapshot=EXCLUDED.snapshot,source_updated_at=EXCLUDED.source_updated_at,updated_at=now()
        WHERE finance_sales.source_updated_at<=EXCLUDED.source_updated_at RETURNING *`,
      [this.tenant,p.externalKey,p.customerName,p.customerDocument,p.customerEmail,p.description,p.amountCents,p.billingMode,terminal,p.snapshot,p.eventDate])
      const sale = result.rows[0]
      if (!sale) return { stale: true }
      if (sale.status !== 'active') {
        await c.query("UPDATE finance_commissions SET status='void',updated_at=now() WHERE tenant_key=$1 AND sale_id=$2 AND status IN ('calculated','released')", [this.tenant,sale.id])
        await c.query("UPDATE finance_jobs j SET status='canceled',last_error='Venda estornada/cancelada',updated_at=now() FROM finance_entries e WHERE j.tenant_key=$1 AND j.entry_id=e.id AND e.sale_id=$2 AND j.status IN ('pending','failed')", [this.tenant,sale.id])
        await c.query("UPDATE finance_entries SET status=$3,updated_at=now() WHERE tenant_key=$1 AND sale_id=$2 AND remote_id IS NULL", [this.tenant,sale.id,terminal])
      } else if (p.affiliateCents && p.affiliateCode) {
        const userId = settings.affiliateMap[p.affiliateCode] || null
        await c.query(`INSERT INTO finance_commissions(tenant_key,source_ref,sale_id,beneficiary_id,beneficiary_name,role,amount_cents,evidence)
          VALUES($1,$2,$3,$4,$5,'afiliado',$6,'Conferir se a comissão já é paga diretamente pela Hotmart.')
          ON CONFLICT(tenant_key,source_ref) DO UPDATE SET beneficiary_id=EXCLUDED.beneficiary_id
          WHERE finance_commissions.status='calculated'`, [this.tenant,`hotmart:${p.externalKey}:affiliate`,sale.id,userId,p.affiliateName||p.affiliateCode,p.affiliateCents])
      }
      await this.audit(c,null,`hotmart.${p.eventType}`,sale.id,{ transaction:p.externalKey })
      return { saleId: sale.id }
    })
    const rule=settings.hotmartRules[String(p.snapshot.productId)]
    if(rule&&p.amountCents>0&&p.paymentStatus==='paid'&&p.approvedDate){
      const sale=(await this.rows("SELECT id,schedule_confirmed,status FROM finance_sales WHERE tenant_key=$1 AND origin='hotmart' AND external_key=$2",[this.tenant,p.externalKey]))[0]
      if(sale&&!sale.schedule_confirmed&&sale.status==='active'){
        const due=new Date(`${isoDate(p.approvedDate)}T12:00:00Z`);due.setUTCDate(due.getUTCDate()+rule.dueOffsetDays)
        try{await this.confirmSchedule(sale.id,{count:rule.count,firstDate:due.toISOString().slice(0,10),billingMode:rule.billingMode},null)}
        catch(e){
          if(!(e instanceof FinanceError&&e.status===409))throw e
          // Another webhook can have confirmed this same schedule concurrently.
        }
      }
    }
    return result
  }

  async confirmSchedule(saleId: string, input: { count: number; firstDate: string; billingMode: string; remotePersonId?: string | null }, actor: string | null) {
    return this.transaction(async c => {
      const sale = (await c.query('SELECT * FROM finance_sales WHERE tenant_key=$1 AND id=$2 FOR UPDATE', [this.tenant,saleId])).rows[0]
      if (!sale) throw new FinanceError('Venda não encontrada.',404)
      if (sale.status !== 'active') throw new FinanceError('Venda cancelada ou estornada.')
      if (sale.schedule_confirmed) throw new FinanceError('Calendário já conferido. Ajustes precisam de conciliação para preservar os títulos existentes.',409)
      if (!['single','fixed','subscription'].includes(input.billingMode)) throw new FinanceError('Confirme a modalidade da venda.')
      if (input.billingMode !== 'fixed' && input.count !== 1) throw new FinanceError('Assinaturas e pagamentos únicos geram somente a cobrança confirmada; renovações entram por transação.')
      const schedule = buildSchedule(Number(sale.amount_cents),input.count,input.firstDate)
      for (const [i,p] of Array.from(schedule.entries())) {
        const entry = (await c.query(`INSERT INTO finance_entries(tenant_key,origin,source_ref,sale_id,kind,description,customer_name,
          amount_cents,due_date,competence_date,remote_person_id) VALUES($1,$2,$3,$4,'receivable',$5,$6,$7,$8,$8,$9) RETURNING id`,
        [this.tenant,sale.origin,`sale:${sale.id}:${i+1}`,sale.id,`${sale.description} (${i+1}/${schedule.length})`,sale.customer_name,p.amountCents,p.dueDate,input.remotePersonId||null])).rows[0]
        await c.query('INSERT INTO finance_jobs(tenant_key,entry_id) VALUES($1,$2)',[this.tenant,entry.id])
      }
      await c.query(`UPDATE finance_sales SET billing_mode=$3,schedule_confirmed=true,remote_person_id=$4,needs_review=NULL,updated_at=now()
        WHERE tenant_key=$1 AND id=$2`,[this.tenant,saleId,input.billingMode,input.remotePersonId||null])
      await this.audit(c,actor,'schedule.confirmed',saleId,{ count:input.count,firstDate:input.firstDate })
      return { created: schedule.length }
    })
  }

  async releaseCommission(id: string, date: string, evidence: string, actor: string) {
    isoDate(date)
    if (date > businessDate() || evidence.trim().length < 10) throw new FinanceError('Informe data não futura e evidência da liberação (mínimo 10 caracteres).')
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`finance-close:${this.tenant}:${date.slice(0,7)}`])
      if ((await c.query('SELECT 1 FROM finance_closings WHERE tenant_key=$1 AND period=$2',[this.tenant,date.slice(0,7)])).rowCount) {
        throw new FinanceError('Período já fechado. Registre o ajuste em uma competência aberta.',409)
      }
      const r = await c.query(`UPDATE finance_commissions cm SET status='released',eligibility_date=$3,evidence=$4,updated_at=now()
        FROM finance_sales s,users u WHERE cm.tenant_key=$1 AND cm.id=$2 AND cm.status='calculated'
        AND cm.beneficiary_id=u.id AND u.active AND NOT cm.paid_by_hotmart AND cm.sale_id=s.id
        AND s.tenant_key=$1 AND s.status='active' AND s.needs_review IS NULL RETURNING cm.id`,[this.tenant,id,date,evidence.trim()])
      if (!r.rowCount) throw new FinanceError('Comissão sem beneficiário ativo, venda em conferência ou situação incompatível com liberação.',409)
      await this.audit(c,actor,'commission.released',id,{ date,evidence })
    })
  }

  async closeMonth(period: string, actor: string) {
    const due = closingDueDate(period)
    if (period >= businessDate().slice(0,7)) throw new FinanceError('Feche somente uma competência encerrada.')
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`finance-close:${this.tenant}:${period}`])
      const previous = (await c.query('SELECT * FROM finance_closings WHERE tenant_key=$1 AND period=$2',[this.tenant,period])).rows[0]
      if (previous) return previous
      const items = (await c.query(`SELECT cm.*,s.origin,s.description sale_description FROM finance_commissions cm
        JOIN finance_sales s ON s.id=cm.sale_id AND s.tenant_key=cm.tenant_key JOIN users u ON u.id=cm.beneficiary_id AND u.active
        WHERE cm.tenant_key=$1 AND cm.status='released' AND NOT cm.paid_by_hotmart AND to_char(cm.eligibility_date,'YYYY-MM')=$2
          AND s.status='active' AND s.needs_review IS NULL ORDER BY cm.id FOR UPDATE OF cm`,[this.tenant,period])).rows
      if (!items.length) throw new FinanceError('Não há comissões liberadas e conferidas nesta competência.')
      const total = items.reduce((sum,r)=>sum+Number(r.amount_cents),0)
      if(!Number.isSafeInteger(total))throw new FinanceError('Total do fechamento fora do limite monetário.')
      const closing = (await c.query(`INSERT INTO finance_closings(tenant_key,period,due_date,total_cents,snapshot,approved_by)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[this.tenant,period,due,total,JSON.stringify(items),actor])).rows[0]
      const groups = new Map<string, { name:string; amount:number }>()
      for (const item of items) {
        const g = groups.get(item.beneficiary_id) ?? { name:item.beneficiary_name,amount:0 }
        g.amount += Number(item.amount_cents); groups.set(item.beneficiary_id,g)
      }
      for (const [id,g] of Array.from(groups.entries())) {
        const person = (await c.query('SELECT remote_person_id FROM finance_people WHERE tenant_key=$1 AND user_id=$2',[this.tenant,id])).rows[0]
        const entry = (await c.query(`INSERT INTO finance_entries(tenant_key,origin,source_ref,closing_id,beneficiary_id,kind,description,customer_name,
          remote_person_id,amount_cents,due_date,competence_date) VALUES($1,'projete',$2,$3,$4,'payable',$5,$6,$7,$8,$9,$10) RETURNING id`,
        [this.tenant,`closing:${closing.id}:${id}`,closing.id,id,`Comissões ${period} — ${g.name}`,g.name,person?.remote_person_id||null,g.amount,due,`${period}-01`])).rows[0]
        await c.query('INSERT INTO finance_jobs(tenant_key,entry_id) VALUES($1,$2)',[this.tenant,entry.id])
      }
      await c.query("UPDATE finance_commissions SET status='approved',closing_id=$3,updated_at=now() WHERE tenant_key=$1 AND id=ANY($2::uuid[])",[this.tenant,items.map(r=>r.id),closing.id])
      await this.audit(c,actor,'closing.approved',closing.id,{ period,totalCents:total,items:items.length })
      return closing
    })
  }

  async list() {
    const [sales,commissions,closings,jobs,users,people,runs,deliveries] = await Promise.all([
      this.rows('SELECT * FROM finance_sales WHERE tenant_key=$1 ORDER BY created_at DESC LIMIT 500',[this.tenant]),
      this.rows(`SELECT cm.*,s.origin,s.needs_review,s.description sale_description FROM finance_commissions cm JOIN finance_sales s ON s.id=cm.sale_id
        WHERE cm.tenant_key=$1 ORDER BY cm.created_at DESC LIMIT 1000`,[this.tenant]),
      this.rows('SELECT id,period,due_date::text,total_cents,created_at FROM finance_closings WHERE tenant_key=$1 ORDER BY period DESC LIMIT 36',[this.tenant]),
      this.rows(`SELECT j.*,e.description FROM finance_jobs j JOIN finance_entries e ON e.id=j.entry_id WHERE j.tenant_key=$1 ORDER BY j.created_at DESC LIMIT 200`,[this.tenant]),
      this.rows('SELECT id,nome,email,role FROM users WHERE active ORDER BY nome'),
      this.rows('SELECT * FROM finance_people WHERE tenant_key=$1',[this.tenant]),
      this.rows('SELECT * FROM finance_runs WHERE tenant_key=$1 ORDER BY started_at DESC LIMIT 20',[this.tenant]),
      this.rows('SELECT * FROM finance_deliveries WHERE tenant_key=$1 ORDER BY created_at DESC LIMIT 30',[this.tenant]),
    ])
    return { sales,commissions,closings,jobs,users,people,runs,deliveries,settings:await this.settings() }
  }
}
