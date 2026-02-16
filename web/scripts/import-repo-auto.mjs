// Auto-import leads from 3 repo bases (siconv_programa + siconv_emenda + siconv_proponentes)
// Uses spreadsheet ONLY for vendedor distribution (which CNPJ goes to which vendedor)
// Run from web/ directory: node scripts/import-repo-auto.mjs
import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import pg from 'pg'
import XLSX from 'xlsx'

// --- Config ---
const XLSX_PATH = '/Users/pauloloureiro/Downloads/PRIMEIROS TESTES VENDAS - PROGRAMAS 2026.xlsx'
const REPO_DIR = '../data/raw/2026-02-16'
const PROGRAMA_CSV = `${REPO_DIR}/programas/siconv_programa.csv`
const EMENDA_CSV = `${REPO_DIR}/emendas/siconv_emenda.csv`
const PROPONENTE_CSV = `${REPO_DIR}/proponentes/siconv_proponentes.csv`

const VENDEDOR_MAP = {
  'wellington': 'wellington@projetus.org',
  'elisson': 'elisson@projetus.org',
  'gabriel': 'gabriel@projetus.org',
  'vitoria': 'vitoria@projetus.org',
}

// --- DB Connection ---
const envContent = readFileSync('.env.local', 'utf8')
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1]
if (!dbUrl) { console.error('No DATABASE_URL found in .env.local'); process.exit(1) }
const pool = new pg.Pool({ connectionString: dbUrl, max: 3, ssl: { rejectUnauthorized: false } })

// --- Helpers ---
function cleanCNPJ(val) {
  if (!val) return null
  const str = String(val).replace(/\D/g, '')
  if (str.length < 11) return null
  return str.padStart(14, '0')
}

function parseBRNumber(val) {
  if (!val || String(val).trim() === '') return 0
  const str = String(val).trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function formatPhone(raw) {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  // Strip trunk prefix 0 (e.g., 09132264140 -> 9132264140)
  if (digits.length === 11 && digits.startsWith('0') && !digits.startsWith('0800')) {
    const ddd = digits.slice(1, 3)
    // Valid DDDs are 11-99 (no leading 0 in DDD)
    if (parseInt(ddd) >= 11) digits = digits.slice(1)
  }
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length >= 8) return raw
  return null
}

// Fix encoding artifacts and missing accents in source data
function fixText(text) {
  if (!text) return text
  let s = String(text)

  // Fix known '?' replacements in program names (source CSV has literal '?' for accented chars)
  const qReplacements = {
    'A??es': 'Ações', 'A??O': 'AÇÃO', 'a??es': 'ações', 'a??o': 'ação',
    'Excel?ncia': 'Excelência', 'EXCEL?NCIA': 'EXCELÊNCIA',
    'Solid?ria': 'Solidária', 'SOLID?RIA': 'SOLIDÁRIA',
    'Sustent?veis': 'Sustentáveis', 'SUSTENT?VEIS': 'SUSTENTÁVEIS',
    'Sustent?vel': 'Sustentável', 'SUSTENT?VEL': 'SUSTENTÁVEL',
    'Agroind?stria': 'Agroindústria', 'AGROIND?STRIA': 'AGROINDÚSTRIA',
    'Agropecu?rio': 'Agropecuário', 'AGROPECU?RIO': 'AGROPECUÁRIO',
    'Crian?a': 'Criança', 'CRIAN?A': 'CRIANÇA',
    'Sa?de': 'Saúde', 'SA?DE': 'SAÚDE',
    'Ci?ncia': 'Ciência', 'CI?NCIA': 'CIÊNCIA',
    'Tecnol?gico': 'Tecnológico', 'TECNOL?GICO': 'TECNOLÓGICO',
    'Tur?stico': 'Turístico', 'TUR?STICO': 'TURÍSTICO',
    'Econ?mico': 'Econômico', 'ECON?MICO': 'ECONÔMICO',
    'P?blico': 'Público', 'P?BLICO': 'PÚBLICO',
    'P?blica': 'Pública', 'P?BLICA': 'PÚBLICA',
    'Educa??o': 'Educação', 'EDUCA??O': 'EDUCAÇÃO',
    'Habita??o': 'Habitação', 'HABITA??O': 'HABITAÇÃO',
    'Prote??o': 'Proteção', 'PROTE??O': 'PROTEÇÃO',
    'Produ??o': 'Produção', 'PRODU??O': 'PRODUÇÃO',
    'Alimenta??o': 'Alimentação', 'ALIMENTA??O': 'ALIMENTAÇÃO',
    'Promo??o': 'Promoção', 'PROMO??O': 'PROMOÇÃO',
    'Inova??o': 'Inovação', 'INOVA??O': 'INOVAÇÃO',
    'Conserva??o': 'Conservação', 'CONSERVA??O': 'CONSERVAÇÃO',
    'Gest?o': 'Gestão', 'GEST?O': 'GESTÃO',
    'Integra??o': 'Integração', 'INTEGRA??O': 'INTEGRAÇÃO',
    'Inclus?o': 'Inclusão', 'INCLUS?O': 'INCLUSÃO',
    'Previd?ncia': 'Previdência', 'PREVID?NCIA': 'PREVIDÊNCIA',
    'Ind?gena': 'Indígena', 'IND?GENA': 'INDÍGENA',
    'Assist?ncia': 'Assistência', 'ASSIST?NCIA': 'ASSISTÊNCIA',
    'Seguran?a': 'Segurança', 'SEGURAN?A': 'SEGURANÇA',
    'Cidad?o': 'Cidadão', 'CIDAD?O': 'CIDADÃO',
    'Econ?mica': 'Econômica', 'ECON?MICA': 'ECONÔMICA',
  }
  for (const [wrong, right] of Object.entries(qReplacements)) {
    if (s.includes(wrong)) s = s.replaceAll(wrong, right)
  }

  // Fix missing accents in UPPERCASE ministry names
  const accentFixes = {
    'MINISTERIO': 'MINISTÉRIO',
    'EDUCACAO': 'EDUCAÇÃO',
    'AGRICULTURA': 'AGRICULTURA', // already correct
    'PECUARIA': 'PECUÁRIA',
    'CIDADANIA': 'CIDADANIA', // already correct
    'JUSTICA': 'JUSTIÇA',
    'DEFESA': 'DEFESA', // already correct
    'CIENCIA': 'CIÊNCIA',
    'COMUNICACOES': 'COMUNICAÇÕES',
    'COMUNICACAO': 'COMUNICAÇÃO',
    'FAZENDA': 'FAZENDA', // already correct
    'INTEGRACAO': 'INTEGRAÇÃO',
    'PLANEJAMENTO': 'PLANEJAMENTO', // already correct
    'ORCAMENTO': 'ORÇAMENTO',
    'TRABALHO': 'TRABALHO', // already correct
    'PREVIDENCIA': 'PREVIDÊNCIA',
    'TURISMO': 'TURISMO', // already correct
    'SAUDE': 'SAÚDE',
    'DESENVOLVIMENTO': 'DESENVOLVIMENTO', // already correct
    'ESPORTE': 'ESPORTE', // already correct
  }
  for (const [wrong, right] of Object.entries(accentFixes)) {
    if (wrong !== right && s.includes(wrong)) s = s.replaceAll(wrong, right)
  }

  return s
}

function normalizeHeader(h) {
  return h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

// Parse semicolon-delimited CSV line by line (streaming, memory efficient)
async function parseCSV(filePath, onRow) {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity })
  let headers = null
  for await (const line of rl) {
    const cols = line.split(';')
    if (!headers) {
      headers = cols.map(h => h.replace(/^\ufeff/, '').trim())
      continue
    }
    const row = {}
    for (let i = 0; i < headers.length; i++) row[headers[i]] = (cols[i] || '').trim()
    onRow(row)
  }
}

// --- Main ---
async function main() {
  console.log('=== AUTO-IMPORT FROM 3 REPO BASES ===\n')

  // ============================================================
  // STEP 1: Read spreadsheet for vendedor distribution ONLY
  // ============================================================
  console.log('STEP 1: Reading spreadsheet for vendedor distribution...')
  const buffer = readFileSync(XLSX_PATH)
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Build CNPJ -> vendedor email mapping (first occurrence wins)
  const cnpjToVendedor = new Map()
  for (const sheetName of workbook.SheetNames) {
    const normalized = normalizeHeader(sheetName)
    const vendedorEmail = VENDEDOR_MAP[normalized]
    if (!vendedorEmail) continue

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    for (const raw of rows) {
      // Find CNPJ column
      let cnpjVal = null
      for (const [k, v] of Object.entries(raw)) {
        if (normalizeHeader(k).includes('cnpj')) { cnpjVal = v; break }
      }
      const cnpj = cleanCNPJ(cnpjVal)
      if (cnpj && !cnpjToVendedor.has(cnpj)) {
        cnpjToVendedor.set(cnpj, vendedorEmail)
      }
    }
  }
  console.log(`  Spreadsheet CNPJ->vendedor mappings: ${cnpjToVendedor.size}`)

  // Load vendedor users from DB
  const usersRes = await pool.query("SELECT id, email, nome FROM users WHERE role = 'vendedor' AND active = true ORDER BY nome")
  const usersByEmail = {}
  for (const u of usersRes.rows) usersByEmail[u.email] = u.id
  const vendedorIds = usersRes.rows.map(u => u.id)
  console.log(`  Active vendedores: ${usersRes.rows.map(u => `${u.nome} (${u.email})`).join(', ')}`)

  // ============================================================
  // STEP 2: Load siconv_programa (2026 + OSC)
  // ============================================================
  console.log('\nSTEP 2: Loading siconv_programa (2026 + OSC)...')
  const programas = new Map() // id_programa -> {cod, nome, orgao, modalidade}

  await parseCSV(PROGRAMA_CSV, (row) => {
    const ano = row.ANO_DISPONIBILIZACAO || ''
    const cod = row.COD_PROGRAMA || ''
    const natJur = row.NATUREZA_JURIDICA_PROGRAMA || ''
    // Accept programs where ANO=2026 OR code year indicates 2026 (CADASTRADO programs have empty ANO)
    const codeYear = cod.length >= 9 ? cod.substring(5, 9) : ''
    const is2026 = ano === '2026' || codeYear === '2026'
    if (!is2026) return
    if (!natJur.toLowerCase().includes('civil') && !natJur.toLowerCase().includes('organiza')) return

    const idProg = row.ID_PROGRAMA || ''
    if (!idProg || programas.has(idProg)) return
    programas.set(idProg, {
      cod: row.COD_PROGRAMA || '',
      nome: row.NOME_PROGRAMA || '',
      orgao: row.DESC_ORGAO_SUP_PROGRAMA || '',
      modalidade: row.MODALIDADE_PROGRAMA || '',
    })
  })

  const validCods = new Set()
  const codToId = new Map()
  for (const [id, info] of programas) {
    validCods.add(info.cod)
    codToId.set(info.cod, id)
  }
  console.log(`  Programs loaded: ${programas.size} (2026 + OSC)`)

  // ============================================================
  // STEP 3: Load siconv_emenda (filtered by our programs)
  // ============================================================
  console.log('\nSTEP 3: Loading siconv_emenda...')
  // key: "cod_programa|cnpj" -> list of emendas
  const emendasMap = new Map()

  await parseCSV(EMENDA_CSV, (row) => {
    const cod = row.COD_PROGRAMA_EMENDA || ''
    if (!validCods.has(cod)) return

    let cnpj = (row.BENEFICIARIO_EMENDA || '').replace(/\D/g, '')
    if (!cnpj) return
    cnpj = cnpj.padStart(14, '0')

    const key = `${cod}|${cnpj}`
    if (!emendasMap.has(key)) emendasMap.set(key, [])
    emendasMap.get(key).push({
      valor: parseBRNumber(row.VALOR_REPASSE_PROPOSTA_EMENDA),
      nr_emenda: row.NR_EMENDA || '',
      parlamentar: row.NOME_PARLAMENTAR || '',
      tipo: row.TIPO_PARLAMENTAR || '',
      qualificacao: row.QUALIF_PROPONENTE || '',
    })
  })

  const totalEmendaRecords = Array.from(emendasMap.values()).reduce((s, v) => s + v.length, 0)
  console.log(`  Emenda records loaded: ${totalEmendaRecords} across ${emendasMap.size} (programa+cnpj) combos`)

  // ============================================================
  // STEP 4: Load siconv_proponentes (contacts + info)
  // ============================================================
  console.log('\nSTEP 4: Loading siconv_proponentes...')
  const proponentes = new Map() // cnpj -> {nome, uf, municipio, email, telefone}

  // Collect which CNPJs we need
  const neededCnpjs = new Set()
  for (const key of emendasMap.keys()) {
    const cnpj = key.split('|')[1]
    neededCnpjs.add(cnpj)
  }

  await parseCSV(PROPONENTE_CSV, (row) => {
    let cnpj = (row.IDENTIF_PROPONENTE || '').replace(/\D/g, '')
    if (!cnpj) return
    cnpj = cnpj.padStart(14, '0')
    if (!neededCnpjs.has(cnpj)) return
    if (proponentes.has(cnpj)) return

    proponentes.set(cnpj, {
      nome: row.NM_PROPONENTE || '',
      municipio: row.MUNICIPIO_PROPONENTE || '',
      uf: row.UF_PROPONENTE || '',
      endereco: row.ENDERECO_PROPONENTE || '',
      email: row.EMAIL_PROPONENTE || '',
      telefone: row.TELEFONE_PROPONENTE || '',
    })
  })
  console.log(`  Proponentes loaded: ${proponentes.size} (of ${neededCnpjs.size} needed)`)

  // ============================================================
  // STEP 5: Build auto-leads
  // ============================================================
  console.log('\nSTEP 5: Building auto-leads...')
  const autoLeads = []

  for (const [key, emendas] of emendasMap) {
    const [codProg, cnpj] = key.split('|')
    const idProg = codToId.get(codProg) || ''
    const prog = programas.get(idProg) || {}
    const prop = proponentes.get(cnpj) || {}

    const link = idProg
      ? `https://discricionarias.transferegov.sistema.gov.br/voluntarias/ConsultarPrograma/ResultadoDaConsultaDeProgramaDeConvenioDetalhar.do?id=${idProg}&Usr=guest&Pwd=guest`
      : ''

    // Cascata: concatenate emendas
    const totalValor = emendas.reduce((s, e) => s + e.valor, 0)
    const nrEmendas = emendas.map(e => e.nr_emenda).filter(Boolean).join(' | ')
    const parlamentares = [...new Set(emendas.map(e => fixText(e.parlamentar)).filter(Boolean))].join(' | ')

    // Vendedor from spreadsheet mapping
    const vendedorEmail = cnpjToVendedor.get(cnpj) || null

    autoLeads.push({
      cnpj,
      nome: prop.nome || null,
      uf: prop.uf || null,
      municipio: prop.municipio || null,
      email: prop.email || null,
      telefone: formatPhone(prop.telefone) || null,
      codigo_programa: codProg,
      nome_programa: fixText(prog.nome) || null,
      orgao_concedente: fixText(prog.orgao) || null,
      link_externo: link,
      valor_emenda: totalValor > 0 ? totalValor : null,
      nr_emenda: nrEmendas || null,
      parlamentar: parlamentares || null,
      qualificacao: emendas[0]?.qualificacao || null,
      vendedorEmail,
      n_emendas: emendas.length,
    })
  }

  console.log(`  Auto-leads built: ${autoLeads.length}`)
  console.log(`  With vendedor from spreadsheet: ${autoLeads.filter(l => l.vendedorEmail).length}`)
  console.log(`  New leads (not in spreadsheet): ${autoLeads.filter(l => !l.vendedorEmail).length}`)

  // Distribute unassigned leads round-robin
  let rrIdx = 0
  for (const lead of autoLeads) {
    if (!lead.vendedorEmail) {
      lead.vendedorEmail = Object.values(VENDEDOR_MAP)[rrIdx % Object.values(VENDEDOR_MAP).length]
      rrIdx++
    }
  }

  // Load existing clients
  const clientsRes = await pool.query('SELECT cnpj FROM existing_clients').catch(() => ({ rows: [] }))
  const existingClients = new Set()
  for (const c of clientsRes.rows) {
    const cc = cleanCNPJ(c.cnpj)
    if (cc) existingClients.add(cc)
  }

  // ============================================================
  // STEP 6: Reset DB
  // ============================================================
  console.log('\nSTEP 6: Resetting DB...')
  const vpBefore = await pool.query('SELECT COUNT(*) as cnt FROM vendedor_projetos')
  console.log(`  Before: ${vpBefore.rows[0].cnt} leads`)

  await pool.query('TRUNCATE TABLE contact_notes, commission_overrides, vendedor_projetos RESTART IDENTITY CASCADE').catch(async () => {
    await pool.query('TRUNCATE TABLE contact_notes').catch(() => {})
    await pool.query('TRUNCATE TABLE commission_overrides').catch(() => {})
    await pool.query('TRUNCATE TABLE vendedor_projetos RESTART IDENTITY CASCADE')
  })
  console.log('  Truncated: vendedor_projetos, contact_notes, commission_overrides')

  // ============================================================
  // STEP 7: Insert leads
  // ============================================================
  console.log('\nSTEP 7: Inserting leads...')
  const INSERT_SQL = `
    INSERT INTO vendedor_projetos (
      vendedor_id, codigo_programa, nome_programa, link_externo, orgao_concedente,
      uf, municipio, qualificacao, nr_emenda, parlamentar,
      cnpj, nome, natureza_juridica,
      valor_emenda, valor_global, valor_empenhado, valor_liberado,
      nr_convenio, objeto, modalidade, situacao, saldo_conta,
      telefone, email, observacoes,
      importado_de
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
  `

  let inserted = 0, skipped = 0
  const cnpjsNeedingContacts = new Set()

  for (const lead of autoLeads) {
    const vendedorId = lead.vendedorEmail ? usersByEmail[lead.vendedorEmail] || null : null
    const isExisting = existingClients.has(lead.cnpj)
    const obs = isExisting ? '⚠️ JA E CLIENTE PROJETUS' : null

    const values = [
      vendedorId,
      lead.codigo_programa,
      lead.nome_programa,
      lead.link_externo,
      lead.orgao_concedente,
      lead.uf ? lead.uf.toUpperCase() : null,
      lead.municipio,
      lead.qualificacao,
      lead.nr_emenda,
      lead.parlamentar,
      lead.cnpj,
      lead.nome || 'Sem nome',
      null, // natureza_juridica - will be enriched via BrasilAPI
      lead.valor_emenda,
      null, null, null, // valor_global, empenhado, liberado
      null, null, null, null, null, // nr_convenio, objeto, modalidade, situacao, saldo_conta
      lead.telefone,
      lead.email,
      obs,
      'auto-repo',
    ]

    try {
      await pool.query(INSERT_SQL, values)
      inserted++
      if (!lead.telefone && !lead.email) cnpjsNeedingContacts.add(lead.cnpj)
    } catch (err) {
      console.error(`  Insert error CNPJ ${lead.cnpj}: ${err.message}`)
      skipped++
    }
  }
  console.log(`  Inserted: ${inserted}, Skipped: ${skipped}`)

  // ============================================================
  // STEP 8: BrasilAPI enrichment
  // ============================================================
  if (cnpjsNeedingContacts.size > 0) {
    console.log(`\nSTEP 8: BrasilAPI enrichment for ${cnpjsNeedingContacts.size} CNPJs...`)
    let apiEnriched = 0, apiNoData = 0, apiErrors = 0
    const cnpjsArr = Array.from(cnpjsNeedingContacts)

    for (let i = 0; i < cnpjsArr.length; i++) {
      const cnpj = cnpjsArr[i]
      if (i % 10 === 0) console.log(`  Processing ${i + 1}/${cnpjsArr.length}...`)

      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
        })
        if (!res.ok) { apiErrors++; await delay(500); continue }

        const data = await res.json()
        const phoneRaw = data.ddd_telefone_1 || ''
        const phone = formatPhone(phoneRaw)
        const rawEmail = (data.email || '').trim().toLowerCase()
        const email = rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@') ? rawEmail : null
        const nome = data.razao_social || data.nome_fantasia || null
        const natJur = data.natureza_juridica ? data.natureza_juridica.replace(/^\d+\s*-\s*/, '') : null

        if (!phone && !email && !nome) { apiNoData++; await delay(500); continue }

        const updates = []
        const params = []
        let idx = 1
        if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx++})`); params.push(phone) }
        if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${idx++})`); params.push(email) }
        if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${idx++} ELSE nome END`); params.push(nome) }
        if (natJur) { updates.push(`natureza_juridica = COALESCE(natureza_juridica, $${idx++})`); params.push(natJur) }
        updates.push('updated_at = NOW()')
        params.push(cnpj)

        await pool.query(
          `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx}`,
          params
        )
        apiEnriched++
      } catch {
        apiErrors++
      }
      await delay(500)
    }
    console.log(`  BrasilAPI: ${apiEnriched} enriched, ${apiNoData} no data, ${apiErrors} errors`)
  } else {
    console.log('\nSTEP 8: No BrasilAPI enrichment needed.')
  }

  // ============================================================
  // STEP 9: Final stats
  // ============================================================
  console.log('\n' + '='.repeat(60))
  console.log('FINAL DB STATE')
  console.log('='.repeat(60))

  const stats = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN codigo_programa IS NOT NULL AND codigo_programa != '' THEN 1 END) as with_cod_prog,
      COUNT(CASE WHEN nome_programa IS NOT NULL AND nome_programa != '' THEN 1 END) as with_nome_prog,
      COUNT(CASE WHEN valor_emenda IS NOT NULL AND valor_emenda > 0 THEN 1 END) as with_valor,
      COUNT(CASE WHEN nr_emenda IS NOT NULL AND nr_emenda != '' THEN 1 END) as with_nr_emenda,
      COUNT(CASE WHEN parlamentar IS NOT NULL AND parlamentar != '' THEN 1 END) as with_parlamentar,
      COUNT(CASE WHEN link_externo IS NOT NULL AND link_externo != '' THEN 1 END) as with_link,
      COUNT(CASE WHEN orgao_concedente IS NOT NULL AND orgao_concedente != '' THEN 1 END) as with_orgao,
      COUNT(CASE WHEN uf IS NOT NULL AND uf != '' THEN 1 END) as with_uf,
      COUNT(CASE WHEN municipio IS NOT NULL AND municipio != '' THEN 1 END) as with_mun,
      COUNT(CASE WHEN telefone IS NOT NULL AND telefone != '' THEN 1 END) as with_phone,
      COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
      COUNT(CASE WHEN (telefone IS NOT NULL AND telefone != '') OR (email IS NOT NULL AND email != '') THEN 1 END) as with_contact,
      COUNT(CASE WHEN nome IS NOT NULL AND nome != '' AND nome != 'Sem nome' THEN 1 END) as with_nome,
      COALESCE(SUM(valor_emenda), 0) as total_valor
    FROM vendedor_projetos
  `)
  const s = stats.rows[0]
  console.log(`Total leads: ${s.total}`)
  console.log(`  codigo_programa: ${s.with_cod_prog}`)
  console.log(`  nome_programa:   ${s.with_nome_prog}`)
  console.log(`  valor_emenda:    ${s.with_valor} (total: R$ ${Number(s.total_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
  console.log(`  nr_emenda:       ${s.with_nr_emenda}`)
  console.log(`  parlamentar:     ${s.with_parlamentar}`)
  console.log(`  link_externo:    ${s.with_link}`)
  console.log(`  orgao:           ${s.with_orgao}`)
  console.log(`  nome:            ${s.with_nome}`)
  console.log(`  uf:              ${s.with_uf}`)
  console.log(`  municipio:       ${s.with_mun}`)
  console.log(`  telefone:        ${s.with_phone}`)
  console.log(`  email:           ${s.with_email}`)
  console.log(`  any contact:     ${s.with_contact}`)

  // Per-vendedor
  const vs = await pool.query(`
    SELECT u.nome, COUNT(*) as leads,
      COUNT(CASE WHEN vp.valor_emenda IS NOT NULL AND vp.valor_emenda > 0 THEN 1 END) as with_valor,
      COUNT(CASE WHEN vp.telefone IS NOT NULL AND vp.telefone != '' THEN 1 END) as with_phone,
      COUNT(CASE WHEN vp.email IS NOT NULL AND vp.email != '' THEN 1 END) as with_email,
      COALESCE(SUM(vp.valor_emenda), 0) as total_valor
    FROM vendedor_projetos vp
    LEFT JOIN users u ON u.id = vp.vendedor_id
    GROUP BY u.nome ORDER BY u.nome
  `)
  console.log('\nPer-vendedor:')
  for (const v of vs.rows) {
    console.log(`  ${v.nome || 'UNASSIGNED'}: ${v.leads} leads, ${v.with_valor} com valor, ${v.with_phone} phones, ${v.with_email} emails, R$ ${Number(v.total_valor).toLocaleString('pt-BR')}`)
  }

  // Sample leads
  const samples = await pool.query(`
    SELECT cnpj, nome, codigo_programa, nome_programa, valor_emenda, nr_emenda, parlamentar, orgao_concedente, uf, telefone, email
    FROM vendedor_projetos WHERE valor_emenda IS NOT NULL ORDER BY valor_emenda DESC LIMIT 5
  `)
  console.log('\nTop 5 leads by valor:')
  for (const r of samples.rows) {
    console.log(`  ${r.cnpj} | ${(r.nome || '').substring(0, 35)} | R$ ${Number(r.valor_emenda).toLocaleString('pt-BR')} | ${r.parlamentar?.substring(0, 25)} | ${r.uf} | ${r.telefone || r.email || 'NO CONTACT'}`)
  }

  await pool.end()
  console.log('\nDone!')
}

main().catch(err => { console.error(err); process.exit(1) })
