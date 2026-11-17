import { z } from 'zod'
import { FinanceError, businessDate, isoDate } from '../finance/domain.ts'

export const uuid = z.string().uuid()
const date = z.string().refine(v => { try { isoDate(v); return true } catch { return false } }, 'Data inválida')
const text = (max = 2000) => z.string().trim().max(max)
const money = z.number().int().min(1).max(1_000_000_000_000)
const externalId = z.string().uuid()
export const documentTypes = ['receipt','quote','justification','other'] as const
export const documentLabels = { receipt: 'Comprovante da despesa', quote: 'Orçamento / proposta', justification: 'Justificativa complementar', other: 'Outro documento' }
export const policySchema = z.object({
  enabled: z.boolean(), reference: text(500), exportsEnabled: z.boolean(),
  areas: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,50}$/), name: text(100).min(2), headId: uuid, alternateHeadId: uuid.nullable(), costCenterId: externalId.nullable() }).strict()).max(50),
  adminIds: z.array(uuid).max(30), financeIds: z.array(uuid).max(30),
  authorities: z.array(z.object({ userId: uuid, title: z.enum(['COO','CEO']), limitCents: money }).strict()).max(20),
  categories: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,50}$/), name: text(100).min(2), requiresAuthorization: z.boolean(), exemptionLimitCents: z.number().int().min(0).max(1_000_000_000_000), categoryId: externalId.nullable(), authorizationDocs: z.array(z.enum(documentTypes)).max(4) }).strict()).max(50),
  holidays: z.array(date).max(1000), calendarYears: z.array(z.number().int().min(2026).max(2100)).max(20),
}).strict().superRefine((p,c) => {
  for (const list of [p.areas,p.categories]) if (new Set(list.map(x=>x.id)).size !== list.length) c.addIssue({code:'custom',message:'Identificadores de área ou categoria repetidos.'})
  if(p.areas.some(a=>a.headId===a.alternateHeadId))c.addIssue({code:'custom',message:'O Head substituto deve ser outra pessoa.'})
  if(p.enabled && (!p.reference || !p.areas.length || !p.categories.length || !p.adminIds.length || !p.financeIds.length || !p.authorities.length)) c.addIssue({code:'custom',message:'Informe a política, áreas, categorias e todos os responsáveis antes de ativar.'})
  if(p.exportsEnabled&&!p.enabled)c.addIssue({code:'custom',message:'Ative a política antes de habilitar a integração.'})
})
export type Policy = z.infer<typeof policySchema> & { version: number }
export const emptyPolicy: Policy = { version:0, enabled:false, reference:'', exportsEnabled:false, areas:[], adminIds:[], financeIds:[], authorities:[], categories:[], holidays:[], calendarYears:[] }
export const requestSchema = z.object({
  title: text(180).min(5), purpose: text().min(10), justification: text().min(10),
  areaId: text(50).min(1), categoryId: text(50).min(1), amountCents: money,
  periodStart: date, periodEnd: date, projectReference: text(250),
  exemptionReason: text(), supplierId: externalId.nullable(), paymentDueDate: date.nullable(),
}).strict().refine(d=>d.periodStart<=d.periodEnd,'O fim do período deve ser posterior ao início.')
export type RequestData = z.infer<typeof requestSchema>
export type Actor = { userId:string; role:string }
export type Status = 'draft'|'head_review'|'admin_review'|'authority_review'|'changes'|'approved'|'finance_review'|'exception_review'|'released'|'rejected'|'canceled'
export type Expense = { id:string; requester_id:string; kind:'authorization'|'reimbursement'|'purchase'; status:Status; revision:number; data:RequestData; policy:Policy|null; authorization_id:string|null; authority_id:string|null; approved_amount_cents:number|null; execution_mode:'company'|'employee'|null; valid_until:string|null; [key:string]:any }
export const statusLabels: Record<Status,string> = { draft:'Rascunho', head_review:'Conferência do Head', admin_review:'Análise administrativa', authority_review:'Decisão COO / CEO', changes:'Em ajuste', approved:'Autorização aprovada', finance_review:'Conferência financeira', exception_review:'Decisão sobre exceção', released:'Liberada ao financeiro', rejected:'Rejeitada', canceled:'Cancelada' }
export const kindLabels = { authorization:'Autorização prévia', reimbursement:'Reembolso', purchase:'Compra pela empresa' }
export const editable = (r:Expense,a:Actor) => r.requester_id===a.userId && ['draft','changes'].includes(r.status)
export const managesPolicy = (a:Actor) => ['admin','diretoria'].includes(a.role)
export function areaOf(r:Expense,p:Policy) { return p.areas.find(a=>a.id===r.data.areaId) }
export function reviewers(r:Expense,p:Policy):string[] {
  const area=areaOf(r,p)
  if(r.status==='head_review')return [area?.headId,area?.alternateHeadId].filter((id):id is string=>!!id&&id!==r.requester_id)
  if(r.status==='admin_review')return p.adminIds.filter(id=>id!==r.requester_id)
  if(['authority_review','exception_review'].includes(r.status))return r.authority_id?[r.authority_id].filter(id=>id!==r.requester_id):[]
  if(r.status==='finance_review')return p.financeIds.filter(id=>id!==r.requester_id)
  return []
}
export function canRead(r:Expense,a:Actor,current:Policy) {
  if(r.requester_id===a.userId)return true
  if(['draft','changes'].includes(r.status)&&!r.policy)return false
  const policies=[r.policy,current].filter((p):p is Policy=>!!p)
  return policies.some(p=>{const area=areaOf(r,p);return area?.headId===a.userId||area?.alternateHeadId===a.userId||p.adminIds.includes(a.userId)||p.financeIds.includes(a.userId)||r.authority_id===a.userId})
}
export function chooseAuthority(p:Policy,amount:number,requester:string) {
  const authority=[...p.authorities].filter(x=>x.userId!==requester&&x.limitCents>=amount)
    .sort((a,b)=>(a.title==='CEO'?1:0)-(b.title==='CEO'?1:0)||a.limitCents-b.limitCents)[0]
  if(!authority)throw new FinanceError('Não há autoridade com alçada suficiente e sem conflito. Revise a política.',409)
  return authority.userId
}
export function validateSubmission(r:Expense,p:Policy,types:string[]) {
  if(!p.enabled)throw new FinanceError('A política de despesas ainda não foi ativada.',409)
  requestSchema.parse(r.data)
  const area=areaOf(r,p),category=p.categories.find(c=>c.id===r.data.categoryId)
  if(!area||!category)throw new FinanceError('Selecione uma área e categoria da política vigente.')
  if(![area.headId,area.alternateHeadId].some(id=>id&&id!==r.requester_id))throw new FinanceError('Configure um Head sem conflito para esta solicitação.',409)
  const required=r.kind==='authorization'?category.authorizationDocs:['receipt']
  if(required.some(type=>!types.includes(type)))throw new FinanceError(`Anexe os documentos obrigatórios: ${required.map(t=>documentLabels[t as keyof typeof documentLabels]).join(', ')}.`)
  if(r.kind==='reimbursement'&&!r.authorization_id&&(category.requiresAuthorization||r.data.amountCents>category.exemptionLimitCents||r.data.exemptionReason.length<10))throw new FinanceError('Vincule uma autorização válida ou justifique uma dispensa permitida pela política.')
  if(r.kind==='purchase'&&(!r.data.supplierId||!r.data.paymentDueDate))throw new FinanceError('Informe o fornecedor e o vencimento da compra na Conta Azul.')
}
export function addBusinessDays(release:Date,holidays:string[],years:number[]) {
  const d=new Date(`${businessDate(release)}T12:00:00Z`),blocked=new Set(holidays)
  let remaining=2
  while(remaining){
    d.setUTCDate(d.getUTCDate()+1)
    if(!years.includes(d.getUTCFullYear()))throw new FinanceError(`Confirme o calendário de feriados de ${d.getUTCFullYear()} antes da liberação.`,409)
    if(![0,6].includes(d.getUTCDay())&&!blocked.has(d.toISOString().slice(0,10)))remaining--
  }
  return d.toISOString().slice(0,10)
}
export function validateFile(bytes:Buffer,mime:string) {
  if(!bytes.length||bytes.length>5*1024*1024)throw new FinanceError('Cada arquivo deve ter entre 1 byte e 5 MB.')
  const valid=(mime==='application/pdf'&&bytes.subarray(0,5).toString()==='%PDF-')||
    (mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||
    (mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
    (mime==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')
  if(!valid)throw new FinanceError('Envie um PDF ou uma imagem JPEG, PNG ou WebP válida.')
}
