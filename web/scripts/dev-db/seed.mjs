// Seed de desenvolvimento: dados fictícios para rodar o Projete localmente.
// Nunca aponte para produção. Uso (veja README.md nesta pasta):
//   DEV_DATABASE_URL=postgres://postgres:dev@127.0.0.1:55491/projetus_hub node scripts/dev-db/seed.mjs
//
// Usuários de teste (senha de todos: projete-dev-2026):
//   gestor@dev.local, vendedor@dev.local, vendedora@dev.local,
//   coordenador@dev.local, admin@dev.local, financeiro@dev.local

import pg from 'pg'
import bcrypt from 'bcryptjs'

const url = process.env.DEV_DATABASE_URL
if (!url || !/127\.0\.0\.1|localhost/.test(url)) {
  console.error('DEV_DATABASE_URL precisa apontar para um banco local.')
  process.exit(1)
}

const PASSWORD = 'projete-dev-2026'
const client = new pg.Client({ connectionString: url })
await client.connect()

// Gerador determinístico para dados estáveis entre execuções.
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const cnpjFor = (i) => String(10_000_000_000_000 + i * 7_919_137).slice(0, 14)

const USERS = [
  ['Gestor Teste', 'gestor@dev.local', 'gestor'],
  ['Elisa Vendas', 'vendedor@dev.local', 'vendedor'],
  ['Ana Prospecção', 'vendedora@dev.local', 'vendedor'],
  ['Caio Coordenação', 'coordenador@dev.local', 'coordenador'],
  ['Admin Teste', 'admin@dev.local', 'admin'],
  ['Fernanda Financeiro', 'financeiro@dev.local', 'gestor_financeiro'],
]

const ORGS = [
  'INSTITUTO CULTURAL CENTRO DE MEMÓRIA', 'ASSOCIAÇÃO BENEFICENTE PASSOS PARA O FUTURO',
  'INSTITUTO LAR DOS VELHINHOS', 'CINE-CLUBE BÚZIOS', 'ASSOCIAÇÃO NACIONAL DA AGROBIODIVERSIDADE',
  'ASSOCIAÇÃO QUILOMBOLA UNIDOS DE SANTA CRUZ', 'FEDERAÇÃO DO TERCEIRO SETOR', 'INSTITUTO LUMIART',
  'SINDICATO RURAL DE CONCEIÇÃO', 'ASSOCIAÇÃO DE VÔLEI NORTE CATARINENSE', 'INSTITUTO SOCIAL CAPIXABA',
  'ASSOCIAÇÃO CASAS DO SERVO', 'INSTITUTO BRASIL DE CULTURA E ARTE', 'ASSOCIAÇÃO KORPUS FUTSAL',
  'ACADEMIA DE EMPREENDEDORISMO', 'ASSOCIAÇÃO FEMININA DE RECUPERAÇÃO', 'VIVER VOLUNTÁRIOS PRÓ-VIDA',
  'CENTRO COMUNITÁRIO NOVA ESPERANÇA', 'INSTITUTO ESPORTE E CIDADANIA', 'COOPERATIVA AGRÍCOLA DO VALE',
]
const PLACES = [['SÃO PAULO', 'SP'], ['BRASÍLIA', 'DF'], ['GOIÂNIA', 'GO'], ['BELO HORIZONTE', 'MG'],
  ['SALVADOR', 'BA'], ['RECIFE', 'PE'], ['CURITIBA', 'PR'], ['PORTO ALEGRE', 'RS'], ['BELÉM', 'PA'], ['VITÓRIA', 'ES']]
const MINISTERIOS = ['MINISTÉRIO DA CULTURA', 'MINISTÉRIO DO ESPORTE', 'MINISTÉRIO DOS DIREITOS HUMANOS E CIDADANIA',
  'MINISTÉRIO DA AGRICULTURA E PECUÁRIA', 'MINISTÉRIO DO DESENVOLVIMENTO SOCIAL']
const PARLAMENTARES = ['DEP. ANA SOUZA', 'SEN. CARLOS LIMA', 'DEP. JOÃO PEREIRA', 'DEP. MARIA COSTA']
const STATUSES = [
  ['Não Contatado', 40], ['Contatado', 14], ['Sem Interesse', 8], ['Em Atendimento', 14],
  ['Reunião Agendada', 5], ['Proposta Enviada', 6], ['Em Aprovação', 3], ['Fechado', 6], ['Churn', 2],
]
const EXEC_STATUSES = ['Não Contatado', 'Não Contatado', 'Em Atendimento', 'Sem Interesse', 'Proposta Enviada', 'Fechado']
const PC_SITUACOES = ['Prestação de Contas em Análise', 'Prestação de Contas Aprovada',
  'Prestação de Contas enviada para Análise', 'Prestação de Contas em Complementação', 'Prestação de Contas Rejeitada']

await client.query('BEGIN')
await client.query(`TRUNCATE lead_events, contact_notes, lead_contacts, projetos_execucao, existing_clients,
  cron_sync_log, vendedor_projetos RESTART IDENTITY CASCADE`)
await client.query(`DELETE FROM users WHERE email LIKE '%@dev.local'`)

const hash = await bcrypt.hash(PASSWORD, 10)
const userIds = {}
for (const [nome, email, role] of USERS) {
  const { rows } = await client.query(
    `INSERT INTO users (nome, email, password_hash, role, active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [nome, email, hash, role]
  )
  userIds[email] = rows[0].id
}
const sellers = [userIds['vendedor@dev.local'], userIds['vendedora@dev.local'], userIds['coordenador@dev.local']]
const gestor = userIds['gestor@dev.local']

const statusPool = STATUSES.flatMap(([s, n]) => Array(n).fill(s))
let i = 0
for (const status of statusPool) {
  i++
  const cnpj = cnpjFor(i)
  const [municipio, uf] = pick(PLACES)
  const nome = `${pick(ORGS)}${i > ORGS.length ? ` ${i}` : ''}`
  const valor = Math.round(80 + rand() * 900) * 1000
  const owner = i % 11 === 0 ? null : sellers[i % sellers.length]
  const closed = status === 'Fechado'
  const valorVenda = closed ? Math.round(valor * 0.08) : null
  const emendas = i % 7 === 0 ? 2 : 1
  for (let e = 0; e < emendas; e++) {
    await client.query(
      `INSERT INTO vendedor_projetos (cnpj, nome, vendedor_id, uf, municipio, orgao_concedente, parlamentar, nr_emenda,
         codigo_programa, nome_programa, valor_emenda, status_contato, status_contato_execucao, telefone, email,
         valor_venda, comissao_valor, comissao_percentual, comissao_bonus, closer_id, closer_comissao_valor,
         comissao_locked, contrato_assinado, fechamento_at, tipo_servico, importado_de, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'dev-seed',
         NOW() - ($26 || ' days')::interval, NOW() - ($27 || ' hours')::interval)`,
      [cnpj, nome, owner, uf, municipio, pick(MINISTERIOS), pick(PARLAMENTARES), `2026${String(i).padStart(4, '0')}${e}`,
        `PRG${100 + (i % 9)}`, 'Programa de Fomento 2026', valor / emendas, status,
        i % 3 === 0 ? pick(EXEC_STATUSES) : null,
        `(${11 + (i % 80)}) 9${String(10000000 + i * 3571).slice(0, 8)}`, `contato${i}@exemplo.org.br`,
        valorVenda, closed ? valorVenda * 0.05 : null, closed ? 5 : null, closed ? valorVenda * 0.02 : null,
        closed ? gestor : null, closed ? valorVenda * 0.03 : null, closed, closed, closed ? new Date() : null,
        closed ? 'Aprovação' : null, String(30 + i), String(i % 48)]
    )
  }
  if (i % 2 === 0) {
    await client.query(
      `INSERT INTO lead_contacts (lead_cnpj, nome_pessoa, cargo, telefone, email, telefone_status, principal)
       VALUES ($1, $2, 'Presidente', $3, $4, $5, true)`,
      [cnpj, `Contato ${i}`, `(61) 9${String(20000000 + i * 911).slice(0, 8)}`, `pres${i}@exemplo.org.br`,
        i % 13 === 0 ? 'invalido' : 'valido']
    )
  }
  if (owner && status !== 'Não Contatado') {
    await client.query(
      `INSERT INTO contact_notes (lead_cnpj, vendedor_id, tipo, observacao, created_at)
       VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::interval)`,
      [cnpj, owner, pick(['ligacao', 'whatsapp', 'email', 'reuniao']), 'Conversa sobre a emenda e próximos passos.', String(i % 12)]
    )
  }
  // Convênios em execução / prestação de contas para parte dos leads
  if (i % 2 === 0) {
    const fase = i % 4 === 0 ? 'Em execução' : pick(PC_SITUACOES)
    const global = valor * 1.4
    const desembolsado = i % 5 === 0 ? 0 : global * rand()
    await client.query(
      `INSERT INTO projetos_execucao (nr_convenio, id_proposta, nr_proposta, situacao, cnpj, nome_proponente, objeto, uf,
         municipio, valor_global, valor_repasse, valor_desembolsado, saldo_conta, rendimento_aplicacao,
         ingresso_contrapartida, data_inicio_vigencia, data_fim_vigencia, ano_referencia, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Aquisição de equipamentos e realização de oficinas',$7,$8,$9,$10,$11,$12,$13,0,
         NOW() - ($14 || ' days')::interval, NOW() + ($15 || ' days')::interval, 2025, NOW())`,
      [`9${String(i).padStart(5, '0')}`, `P${i}`, `${String(i).padStart(6, '0')}/2025`, fase, cnpj, nome, uf, municipio,
        global, global * 0.9, desembolsado, global * 0.2 * rand(), i % 9 === 0 ? 7000 : 300, String(60 + i * 3), String(30 + i * 5)]
    )
  }
}
await client.query(`INSERT INTO existing_clients (cnpj, nome) SELECT cnpj, nome FROM vendedor_projetos WHERE status_contato = 'Fechado' GROUP BY 1, 2`)
await client.query(`INSERT INTO cron_sync_log (ran_at, inserted, updated, errors, duration_ms, source)
  VALUES (NOW() - interval '3 hours', 12, 340, 0, 48000, 'sync-leads'), (NOW() - interval '2 hours', 4, 120, 0, 95000, 'sync-execucao')`)
await client.query('COMMIT')

// Movimentações recentes (passam pelo trigger de histórico com autor)
const moves = [['Não Contatado', 'Em Atendimento'], ['Contatado', 'Reunião Agendada'], ['Em Atendimento', 'Proposta Enviada']]
for (const [from, to] of moves) {
  await client.query('BEGIN')
  await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.origem', 'manual', true)`, [sellers[0]])
  await client.query(
    `UPDATE vendedor_projetos SET status_contato = $2, updated_at = NOW()
     WHERE id = (SELECT id FROM vendedor_projetos WHERE status_contato = $1 AND vendedor_id IS NOT NULL ORDER BY id LIMIT 1)`,
    [from, to]
  )
  await client.query('COMMIT')
}

const { rows: [counts] } = await client.query(
  `SELECT (SELECT COUNT(DISTINCT cnpj) FROM vendedor_projetos) leads, (SELECT COUNT(*) FROM projetos_execucao) convenios,
          (SELECT COUNT(*) FROM lead_events) eventos`
)
console.log(`Seed ok: ${counts.leads} leads, ${counts.convenios} convênios, ${counts.eventos} eventos, ${USERS.length} usuários`)
await client.end()
