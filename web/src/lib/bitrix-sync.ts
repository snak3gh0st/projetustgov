import { query } from '@/lib/db'
import { callBitrixMethod, isBitrixConfigured } from '@/lib/bitrix'

type BitrixEventType = 'lead.upsert' | 'lead.status_changed' | 'lead.assigned' | 'lead.note'

type EnqueueInput = {
  eventType: BitrixEventType
  leadCnpj: string
  payload?: Record<string, unknown>
}

type QueueRow = {
  id: number
  event_type: BitrixEventType
  lead_cnpj: string
  payload: Record<string, unknown>
  attempts: number
}

type LeadSnapshot = {
  cnpj: string
  nome: string | null
  status_contato: string | null
  observacoes: string | null
  valor_emenda: number | null
  valor_venda: number | null
  orgao_concedente: string | null
  uf: string | null
  municipio: string | null
  vendedor_nome: string | null
  vendedor_email: string | null
  telefone: string | null
  email: string | null
  contato_nome: string | null
  contato_cargo: string | null
}

type EntityMap = {
  cnpj: string
  bitrix_company_id: number | null
  bitrix_contact_id: number | null
  bitrix_deal_id: number | null
}

const RETRY_MINUTES = [1, 5, 15, 60, 180]
let ensureTablesPromise: Promise<void> | null = null

function normalizeCnpj(raw: string): string {
  return (raw || '').replace(/\D/g, '')
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function extractPrimaryName(fullName: string | null): { name: string; lastName: string } {
  const clean = (fullName || '').trim()
  if (!clean) return { name: 'Contato Projetus', lastName: '' }
  const parts = clean.split(/\s+/)
  if (parts.length === 1) return { name: parts[0], lastName: '' }
  return { name: parts[0], lastName: parts.slice(1).join(' ') }
}

function buildComment(snapshot: LeadSnapshot, eventType: BitrixEventType, payload: Record<string, unknown>): string {
  const lines: string[] = []
  lines.push('Origem: Projetus CRM')
  lines.push(`Evento: ${eventType}`)
  if (snapshot.status_contato) lines.push(`Status: ${snapshot.status_contato}`)
  if (snapshot.vendedor_nome) lines.push(`Comercial: ${snapshot.vendedor_nome}`)
  if (snapshot.orgao_concedente) lines.push(`Ministerio: ${snapshot.orgao_concedente}`)
  if (snapshot.uf || snapshot.municipio) lines.push(`Local: ${snapshot.municipio || ''}${snapshot.uf ? `/${snapshot.uf}` : ''}`)

  if (eventType === 'lead.note') {
    const noteType = payload.note_type ? String(payload.note_type) : null
    const noteText = payload.note_text ? String(payload.note_text) : null
    if (noteType) lines.push(`Nota (${noteType}):`)
    if (noteText) lines.push(noteText)
  }

  if (snapshot.observacoes) {
    lines.push('Observacoes:')
    lines.push(snapshot.observacoes)
  }

  return lines.join('\n')
}

async function ensureTables(): Promise<void> {
  if (ensureTablesPromise) return ensureTablesPromise

  ensureTablesPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS bitrix_sync_queue (
        id BIGSERIAL PRIMARY KEY,
        event_type VARCHAR(80) NOT NULL,
        lead_cnpj VARCHAR(14) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE INDEX IF NOT EXISTS ix_bitrix_sync_queue_status_next
      ON bitrix_sync_queue(status, next_attempt_at, id)
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS bitrix_entity_map (
        cnpj VARCHAR(14) PRIMARY KEY,
        bitrix_company_id BIGINT,
        bitrix_contact_id BIGINT,
        bitrix_deal_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
  })()

  return ensureTablesPromise
}

async function getLeadSnapshot(cnpj: string): Promise<LeadSnapshot | null> {
  const rows = await query<LeadSnapshot>(
    `SELECT
       vp.cnpj,
       vp.nome,
       vp.status_contato,
       vp.observacoes,
       vp.valor_emenda,
       vp.valor_venda,
       vp.orgao_concedente,
       vp.uf,
       vp.municipio,
       u.nome AS vendedor_nome,
       u.email AS vendedor_email,
       COALESCE(lcp.telefone, vp.telefone) AS telefone,
       COALESCE(lcp.email, vp.email) AS email,
       lcp.nome_pessoa AS contato_nome,
       lcp.cargo AS contato_cargo
     FROM vendedor_projetos vp
     LEFT JOIN users u ON u.id = vp.vendedor_id
     LEFT JOIN LATERAL (
       SELECT lc.nome_pessoa, lc.cargo, lc.telefone, lc.email
       FROM lead_contacts lc
       WHERE lc.lead_cnpj = vp.cnpj
       ORDER BY lc.principal DESC, lc.created_at ASC
       LIMIT 1
     ) lcp ON TRUE
     WHERE vp.cnpj = $1
     ORDER BY vp.updated_at DESC NULLS LAST, vp.id DESC
     LIMIT 1`,
    [cnpj]
  )
  return rows[0] ?? null
}

async function getEntityMap(cnpj: string): Promise<EntityMap | null> {
  const rows = await query<EntityMap>(
    `SELECT cnpj, bitrix_company_id, bitrix_contact_id, bitrix_deal_id
     FROM bitrix_entity_map
     WHERE cnpj = $1
     LIMIT 1`,
    [cnpj]
  )
  return rows[0] ?? null
}

async function upsertEntityMap(cnpj: string, map: Partial<EntityMap>): Promise<void> {
  await query(
    `INSERT INTO bitrix_entity_map (cnpj, bitrix_company_id, bitrix_contact_id, bitrix_deal_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (cnpj) DO UPDATE SET
       bitrix_company_id = COALESCE(EXCLUDED.bitrix_company_id, bitrix_entity_map.bitrix_company_id),
       bitrix_contact_id = COALESCE(EXCLUDED.bitrix_contact_id, bitrix_entity_map.bitrix_contact_id),
       bitrix_deal_id = COALESCE(EXCLUDED.bitrix_deal_id, bitrix_entity_map.bitrix_deal_id),
       updated_at = NOW()`,
    [cnpj, map.bitrix_company_id ?? null, map.bitrix_contact_id ?? null, map.bitrix_deal_id ?? null]
  )
}

async function ensureCompany(snapshot: LeadSnapshot, existingCompanyId: number | null): Promise<number> {
  const companyTitle = `${snapshot.nome || 'Sem Nome'} (${formatCnpj(snapshot.cnpj)})`
  const fields: Record<string, unknown> = {
    TITLE: companyTitle,
  }

  if (snapshot.telefone) {
    fields.PHONE = [{ VALUE: snapshot.telefone, VALUE_TYPE: 'WORK' }]
  }
  if (snapshot.email) {
    fields.EMAIL = [{ VALUE: snapshot.email, VALUE_TYPE: 'WORK' }]
  }
  if (snapshot.observacoes) {
    fields.COMMENTS = snapshot.observacoes
  }

  if (existingCompanyId) {
    await callBitrixMethod('crm.company.update', { id: existingCompanyId, fields })
    return existingCompanyId
  }

  const created = await callBitrixMethod<number>('crm.company.add', { fields })
  return Number(created)
}

async function ensureContact(snapshot: LeadSnapshot, existingContactId: number | null): Promise<number> {
  const nameSource = snapshot.contato_nome || snapshot.nome
  const { name, lastName } = extractPrimaryName(nameSource)
  const fields: Record<string, unknown> = {
    NAME: name,
    LAST_NAME: lastName,
    POST: snapshot.contato_cargo || undefined,
  }

  if (snapshot.telefone) {
    fields.PHONE = [{ VALUE: snapshot.telefone, VALUE_TYPE: 'WORK' }]
  }
  if (snapshot.email) {
    fields.EMAIL = [{ VALUE: snapshot.email, VALUE_TYPE: 'WORK' }]
  }

  if (existingContactId) {
    await callBitrixMethod('crm.contact.update', { id: existingContactId, fields })
    return existingContactId
  }

  const created = await callBitrixMethod<number>('crm.contact.add', { fields })
  return Number(created)
}

async function ensureDeal(
  snapshot: LeadSnapshot,
  companyId: number,
  contactId: number,
  existingDealId: number | null,
  eventType: BitrixEventType,
  payload: Record<string, unknown>
): Promise<number> {
  const valueCandidate = snapshot.valor_venda ?? snapshot.valor_emenda ?? 0
  const opportunity = Number.isFinite(Number(valueCandidate)) ? Number(valueCandidate) : 0

  const fields: Record<string, unknown> = {
    TITLE: `Projetus - ${snapshot.nome || formatCnpj(snapshot.cnpj)}`,
    COMPANY_ID: companyId,
    CONTACT_IDS: [contactId],
    OPPORTUNITY: opportunity,
    CURRENCY_ID: 'BRL',
    SOURCE_DESCRIPTION: `Projetus (${formatCnpj(snapshot.cnpj)})`,
    COMMENTS: buildComment(snapshot, eventType, payload),
    OPENED: 'Y',
    CLOSED: snapshot.status_contato === 'Fechado' ? 'Y' : 'N',
  }

  const assignedBy = process.env.BITRIX_DEFAULT_ASSIGNED_BY_ID
  if (assignedBy) {
    const parsed = Number(assignedBy)
    if (Number.isFinite(parsed) && parsed > 0) {
      fields.ASSIGNED_BY_ID = parsed
    }
  }

  if (existingDealId) {
    await callBitrixMethod('crm.deal.update', { id: existingDealId, fields })
    return existingDealId
  }

  const created = await callBitrixMethod<number>('crm.deal.add', { fields })
  return Number(created)
}

async function linkContactToCompany(companyId: number, contactId: number): Promise<void> {
  await callBitrixMethod('crm.company.contact.add', {
    id: companyId,
    fields: {
      CONTACT_ID: contactId,
      IS_PRIMARY: 'Y',
    },
  })
}

async function processSingleEvent(row: QueueRow): Promise<void> {
  const snapshot = await getLeadSnapshot(row.lead_cnpj)
  if (!snapshot) {
    throw new Error(`Lead snapshot not found for CNPJ ${row.lead_cnpj}`)
  }

  const map = await getEntityMap(row.lead_cnpj)

  const companyId = await ensureCompany(snapshot, map?.bitrix_company_id ?? null)
  const contactId = await ensureContact(snapshot, map?.bitrix_contact_id ?? null)
  await linkContactToCompany(companyId, contactId)
  const dealId = await ensureDeal(
    snapshot,
    companyId,
    contactId,
    map?.bitrix_deal_id ?? null,
    row.event_type,
    row.payload || {}
  )

  await upsertEntityMap(row.lead_cnpj, {
    bitrix_company_id: companyId,
    bitrix_contact_id: contactId,
    bitrix_deal_id: dealId,
  })
}

export async function enqueueBitrixEvent(input: EnqueueInput): Promise<void> {
  const cnpj = normalizeCnpj(input.leadCnpj)
  if (cnpj.length !== 14) return

  await ensureTables()
  await query(
    `INSERT INTO bitrix_sync_queue (event_type, lead_cnpj, payload, status, attempts, next_attempt_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'pending', 0, NOW(), NOW(), NOW())`,
    [input.eventType, cnpj, JSON.stringify(input.payload || {})]
  )

  if (isBitrixConfigured()) {
    void processBitrixQueue({ limit: 1 }).catch((error) => {
      console.error('[bitrix-sync] opportunistic queue processing failed:', error)
    })
  }
}

export async function enqueueBitrixEventsBulk(
  eventType: BitrixEventType,
  leadCnpjs: string[],
  payload?: Record<string, unknown>
): Promise<void> {
  const normalized = Array.from(new Set(leadCnpjs.map(normalizeCnpj).filter((cnpj) => cnpj.length === 14)))
  if (normalized.length === 0) return

  await ensureTables()
  await query(
    `INSERT INTO bitrix_sync_queue (event_type, lead_cnpj, payload, status, attempts, next_attempt_at, created_at, updated_at)
     SELECT $1, cnpj, $2::jsonb, 'pending', 0, NOW(), NOW(), NOW()
     FROM unnest($3::text[]) AS t(cnpj)`,
    [eventType, JSON.stringify(payload || {}), normalized]
  )

  if (isBitrixConfigured()) {
    void processBitrixQueue({ limit: 1 }).catch((error) => {
      console.error('[bitrix-sync] opportunistic bulk queue processing failed:', error)
    })
  }
}

export async function processBitrixQueue(opts?: { limit?: number }): Promise<{
  processed: number
  sent: number
  failed: number
  skippedNoConfig: boolean
}> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 25, 200))
  await ensureTables()

  if (!isBitrixConfigured()) {
    return { processed: 0, sent: 0, failed: 0, skippedNoConfig: true }
  }

  const rows = await query<QueueRow>(
    `SELECT id, event_type, lead_cnpj, payload, attempts
     FROM bitrix_sync_queue
     WHERE status IN ('pending', 'failed')
       AND next_attempt_at <= NOW()
     ORDER BY id ASC
     LIMIT $1`,
    [limit]
  )

  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      await processSingleEvent(row)
      await query(
        `UPDATE bitrix_sync_queue
         SET status = 'sent',
             attempts = attempts + 1,
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      )
      sent++
    } catch (error) {
      const attemptsAfter = row.attempts + 1
      const delayMinutes = RETRY_MINUTES[Math.min(attemptsAfter - 1, RETRY_MINUTES.length - 1)]
      await query(
        `UPDATE bitrix_sync_queue
         SET status = 'failed',
             attempts = $2,
             last_error = $3,
             next_attempt_at = NOW() + (($4::text || ' minutes')::interval),
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, attemptsAfter, String(error), String(delayMinutes)]
      )
      failed++
      console.error(`[bitrix-sync] failed queue item ${row.id}:`, error)
    }
  }

  return {
    processed: rows.length,
    sent,
    failed,
    skippedNoConfig: false,
  }
}
