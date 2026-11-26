import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { alice, bob, viewer, clientA, clientB, testPassword, prepareWorkspaceDb, requireLocalTestDb } from './workspace-fixture.mjs'

const base = process.env.COMMERCIAL_TEST_BASE_URL, database = process.env.COMMERCIAL_TEST_DATABASE_URL
const enabled = Boolean(base && database)
let pool, aCookie, bCookie, vCookie
const paths = { webhook: '/api/whatsapp/webhook', list: '/api/whatsapp/conversas' }
async function login(email) {
  const jar = new Map(), merge = (r) => { for (const line of r.headers.getSetCookie()) { const [pair] = line.split(';'), i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)) } }
  const cookie = () => Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ')
  const csrf = await fetch(`${base}/api/auth/csrf`); merge(csrf)
  const r = await fetch(`${base}/api/auth/callback/credentials`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: testPassword, csrfToken: (await csrf.json()).csrfToken }) })
  merge(r); assert.ok(Array.from(jar.keys()).some((k) => k.includes('session-token')))
  return cookie()
}
async function call(path, { cookie = aCookie, method = 'GET', body, status = 200, headers = {} } = {}) {
  const r = await fetch(`${base}${path}`, { method, headers: { Cookie: cookie ?? '', Origin: base, 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data
}
const attendance = (id, body, extra) => call(`/api/whatsapp/conversas/${id}/atendimento`, { method: 'POST', body, ...extra })
async function inbound(id, message, extra = {}) {
  return call(paths.webhook, { cookie: '', method: 'POST', headers: { 'x-projete-secret': 'synthetic-webhook-secret' }, body: {
    event: 'messages.upsert', instance: 'synthetic', data: { key: { remoteJid: '5511999990001@s.whatsapp.net', remoteJidAlt: 'synthetic-contact@lid', fromMe: false, id }, message, messageTimestamp: 1794924000, ...extra },
  } })
}
before(async () => {
  if (!enabled) return
  requireLocalTestDb(database)
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  pool = new pg.Pool({ connectionString: database })
  await prepareWorkspaceDb(pool)
  const columns = {
    telefone: 'text', status_contato_execucao: 'text', observacoes: 'text', updated_at: 'timestamptz DEFAULT now()', created_at: 'timestamptz DEFAULT now()',
    valor_venda: 'numeric', contrato_assinado: 'boolean DEFAULT false', venda_etapa: 'text', comissao_locked: 'boolean DEFAULT false',
    comissao_percentual: 'numeric', comissao_valor: 'numeric', comissao_bonus: 'numeric', closer_comissao_percentual: 'numeric', closer_comissao_valor: 'numeric',
    fechamento_at: 'timestamptz', tipo_vendedor: 'text', uf: 'text', municipio: 'text', codigo_programa: 'text', nome_programa: 'text', link_externo: 'text',
    orgao_concedente: 'text', qualificacao: 'text', parlamentar: 'text', valor_emenda: 'numeric', valor_global: 'numeric', valor_empenhado: 'numeric',
    valor_liberado: 'numeric', nr_convenio: 'text', objeto: 'text', modalidade: 'text', situacao: 'text', saldo_conta: 'numeric',
  }
  for (const [column, type] of Object.entries(columns)) await pool.query(`ALTER TABLE vendedor_projetos ADD COLUMN IF NOT EXISTS ${column} ${type}`)
  await pool.query('ALTER TABLE lead_contacts ADD COLUMN IF NOT EXISTS telefone text')
  await pool.query("ALTER TABLE lead_contacts ADD COLUMN IF NOT EXISTS telefone_status text; ALTER TABLE projetos_execucao ADD COLUMN IF NOT EXISTS nome_proponente text, ADD COLUMN IF NOT EXISTS municipio text, ADD COLUMN IF NOT EXISTS uf text, ADD COLUMN IF NOT EXISTS valor_global numeric, ADD COLUMN IF NOT EXISTS saldo_conta numeric, ADD COLUMN IF NOT EXISTS valor_desembolsado numeric, ADD COLUMN IF NOT EXISTS data_fim_vigencia date, ADD COLUMN IF NOT EXISTS nr_proposta text")
  await pool.query(`CREATE TABLE IF NOT EXISTS contact_notes(id bigserial PRIMARY KEY,lead_cnpj text,vendedor_id uuid,tipo text,nota text,created_at timestamptz DEFAULT now());
    CREATE TABLE IF NOT EXISTS fundo_comercial_lancamentos(id bigserial PRIMARY KEY,tipo text,valor numeric,descricao text,lead_id integer,criado_por uuid);`)
  for (const file of ['create_whatsapp.sql', 'whatsapp_historico_etiquetas.sql', '20261117_whatsapp_conexao.sql', '20261117_commercial_attendance.sql', 'create_lead_events.sql']) {
    const sql = await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8')
    await pool.query(sql)
    if (file === '20261117_commercial_attendance.sql') await pool.query(sql)
  }
  await pool.query("DELETE FROM whatsapp_conversas WHERE instancia = 'synthetic'")
  await pool.query("UPDATE vendedor_projetos SET status_contato = 'Proposta Enviada', vendedor_id = $1, contrato_assinado = false, valor_venda = 1000, valor_emenda = 1000000, fechamento_at = NULL, comissao_locked = false WHERE id = 10001", [alice])
  aCookie = await login('alice@workspace.example.test'); bCookie = await login('bob@workspace.example.test'); vCookie = await login('leitura@workspace.example.test')
})
after(async () => { await pool?.end() })

test('unlinked contacts are visible; claiming is atomic and hides the assigned conversation from other sellers', { skip: !enabled }, async () => {
  await inbound('incoming-1', { conversation: 'Contato sem projeto 😊' })
  const a = await call(`${paths.list}?filtro=em-aberto`), b = await call(`${paths.list}?filtro=em-aberto`, { cookie: bCookie })
  const c = a.conversas.find((v) => v.telefone === '5511999990001')
  assert.ok(c); assert.ok(b.conversas.some((v) => v.id === c.id))
  const responses = await Promise.all([aCookie, bCookie].map((cookie) => fetch(`${base}/api/whatsapp/conversas/${c.id}/atendimento`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'assumir' }),
  })))
  assert.equal(responses.filter((r) => r.ok).length, 1)
  const winner = responses[0].ok ? aCookie : bCookie, loser = responses[0].ok ? bCookie : aCookie
  await call(`${paths.list}/${c.id}`, { cookie: loser, status: 404 })
  const detail = await call(`${paths.list}/${c.id}`, { cookie: winner })
  assert.equal(detail.conversa.lead_cnpj, null)
  await attendance(c.id, { acao: 'concluir', recebida_em: detail.conversa.ultima_recebida_em, recebida_id: detail.conversa.ultima_recebida_id }, { cookie: winner })
  assert.equal((await call(`${paths.list}/${c.id}`, { cookie: winner })).conversa.aguardando, false)
  await inbound('incoming-new', { conversation: 'Uma nova pergunta' }, { messageTimestamp: 1794924060 })
  const reopened = await call(`${paths.list}/${c.id}`, { cookie: winner })
  assert.equal(reopened.conversa.aguardando, true)
  await attendance(c.id, { acao: 'concluir', recebida_em: detail.conversa.ultima_recebida_em, recebida_id: detail.conversa.ultima_recebida_id }, { cookie: winner, status: 409 })
  await call(`${paths.list}/${c.id}/atendimento`, { cookie: vCookie, method: 'POST', body: { acao: 'assumir' }, status: 403 })
})

test('contact cards and reactions survive the real webhook/store/detail round trip', { skip: !enabled }, async () => {
  await inbound('contact-card', { contactMessage: { displayName: 'Pessoa indicada', vcard: 'BEGIN:VCARD\nFN:Pessoa indicada\nTEL;waid=5521988887777:+55 21 98888-7777\nEND:VCARD' } })
  const c = (await pool.query("SELECT id, atendente_id FROM whatsapp_conversas WHERE instancia = 'synthetic' AND telefone = '5511999990001'")).rows[0]
  const cookie = c.atendente_id === alice ? aCookie : bCookie
  await inbound('react-1', { reactionMessage: { key: { id: 'contact-card' }, text: '👍' } }, { messageTimestamp: 1794924120 })
  const detail = await call(`${paths.list}/${c.id}`, { cookie })
  const m = detail.mensagens.find((v) => v.wa_id === 'contact-card')
  assert.deepEqual(m.midia.contatos, [{ nome: 'Pessoa indicada', telefones: ['5521988887777'] }])
  assert.deepEqual(m.reacoes, [{ emoji: '👍', direcao: 'recebida' }])
  assert.equal(detail.mensagens.some((m) => m.tipo === 'reacao'), false)
  await inbound('react-remove', { reactionMessage: { key: { id: 'contact-card' }, text: '' } }, { messageTimestamp: 1794924180 })
  assert.deepEqual((await call(`${paths.list}/${c.id}`, { cookie })).mensagens.find((v) => v.wa_id === 'contact-card').reacoes, [])
  const current = (await call(`${paths.list}/${c.id}`, { cookie })).conversa
  await attendance(c.id, { acao: 'concluir', recebida_em: current.ultima_recebida_em, recebida_id: current.ultima_recebida_id }, { cookie })
  await inbound('react-after-completion', { reactionMessage: { key: { id: 'contact-card' }, text: '😊' } }, { messageTimestamp: 1794924240 })
  assert.equal((await call(`${paths.list}/${c.id}`, { cookie })).conversa.aguardando, false)
  await inbound('same-second-question', { conversation: 'Mais uma pergunta no mesmo segundo' }, { messageTimestamp: 1794924060 })
  assert.equal((await call(`${paths.list}/${c.id}`, { cookie })).conversa.aguardando, true)
  await attendance(c.id, { acao: 'concluir', recebida_em: current.ultima_recebida_em, recebida_id: current.ultima_recebida_id }, { cookie, status: 409 })
})

test('a forwarded number starts a conversation without a project and belongs to its consultant', { skip: !enabled }, async () => {
  const sent = await call('/api/whatsapp/enviar', { method: 'POST', body: { telefone: '5511977776666', texto: 'Olá 😊' } })
  const detail = await call(`${paths.list}/${sent.conversa_id}`)
  assert.equal(detail.conversa.lead_cnpj, null)
  assert.equal(detail.conversa.atendente_id, alice)
  assert.equal(detail.mensagens.at(-1).texto, 'Olá 😊')
  await call(`${paths.list}/${sent.conversa_id}`, { cookie: bCookie, status: 404 })
  const row = (await pool.query("INSERT INTO whatsapp_conversas(instancia, telefone, jid) VALUES('synthetic','5511977775555','5511977775555@s.whatsapp.net') RETURNING id")).rows[0]
  await call('/api/whatsapp/enviar', { method: 'POST', body: { conversa_id: row.id, texto: 'Sem assumir' }, status: 409 })
})

test('seller submits own lead for approval and records a reasoned loss without gaining closing or cross-owner access', { skip: !enabled }, async () => {
  const path = `/api/leads/${clientA}`
  await call(path, { method: 'PATCH', body: { id: 10001, status_contato: 'Em Aprovação' } })
  await call(path, { method: 'PATCH', body: { id: 10001, status_contato: 'Fechado', valor_venda: 1000 }, status: 403 })
  await call(path, { method: 'PATCH', body: { id: 10001, status_contato: 'Churn' }, status: 400 })
  await call(path, { method: 'PATCH', body: { id: 10001, status_contato: 'Churn', perda_motivo: 'Cliente cancelou a contratação.' } })
  const row = (await pool.query('SELECT status_contato, perda_motivo, perda_por, perda_em FROM vendedor_projetos WHERE id = 10001')).rows[0]
  assert.equal(row.status_contato, 'Churn'); assert.equal(row.perda_por, alice); assert.ok(row.perda_em); assert.equal(row.perda_motivo, 'Cliente cancelou a contratação.')
  await call(`/api/leads/${clientB}`, { method: 'PATCH', body: { id: 10003, status_contato: 'Churn', perda_motivo: 'Não é meu lead.' }, status: 404 })
})

test('BI excludes lost opportunities and grant values, and daily activity honors scope and dates', { skip: !enabled }, async () => {
  await pool.query("UPDATE vendedor_projetos SET status_contato = 'Proposta Enviada', valor_venda = 800, valor_emenda = 9000000 WHERE id = 10002")
  const bi = await call('/api/bi')
  assert.equal(bi.kpis.pipeline_value, 800)
  assert.equal(bi.kpis.churn_count, 1)
  assert.equal(bi.kpis.assigned_count, 2)
  assert.equal(bi.kpis.churn_rate, 50)
  const dashboard = await call('/api/dashboard-crm')
  assert.equal(dashboard.global.by_status.Churn, 1)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const daily = await call(`/api/gestao/atividade-diaria?data=${day}&vendedor_id=${bob}`)
  assert.equal(daily.consultores.length, 1); assert.equal(daily.consultores[0].id, alice)
  assert.equal(daily.consultores[0].movimentados, 1); assert.equal(daily.consultores[0].perdas, 1)
  assert.equal(daily.voip_integrado, false)
  const meuDia = await call('/api/meu-dia')
  assert.ok(Array.isArray(meuDia.aguardando))
  await call('/api/gestao/atividade-diaria?data=2026-02-30', { status: 400 })
  await call('/api/gestao/atividade-diaria', { cookie: vCookie, status: 403 })
})

test('legacy cancellations are included in losses and excluded from negotiated pipeline', { skip: !enabled }, async () => {
  await pool.query("UPDATE vendedor_projetos SET status_contato = 'Cancelado' WHERE id = 10002")
  const bi = await call('/api/bi')
  assert.equal(bi.kpis.churn_count, 2)
  assert.equal(bi.kpis.pipeline_value, 0)
  assert.equal(bi.kpis.churn_rate, 100)
  const dashboard = await call('/api/dashboard-crm')
  // Both opportunities belong to one customer: Home counts CNPJs, BI counts opportunities.
  assert.equal(dashboard.global.by_status.Churn, 1)
})
