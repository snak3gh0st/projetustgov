// Reimport leads from PROGRAMAS 2026 spreadsheet with enrichment
// Run from web/ directory: node scripts/reimport-planilha.mjs
import { readFileSync } from 'fs'
import pg from 'pg'
import XLSX from 'xlsx'

// --- Config ---
const XLSX_PATH = '/Users/pauloloureiro/Downloads/PRIMEIROS TESTES VENDAS - PROGRAMAS 2026.xlsx'

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

const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 3,
  ssl: { rejectUnauthorized: false },
})

// --- Helpers ---
function normalizeHeader(h) {
  return h.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length >= 8) return raw
  return null
}

function cleanCNPJ(val) {
  if (!val) return null
  const str = String(val).replace(/\D/g, '')
  if (str.length < 11) return null
  return str.padStart(14, '0')
}

function parseNumeric(val) {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return val
  const str = String(val).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

const CRM_COLUMN_MAP = {
  'codigo programa': 'codigo_programa',
  'nome programa': 'nome_programa',
  'link externo': 'link_externo',
  'orgao superior': 'orgao_concedente',
  'uf beneficiario': 'uf',
  'municipio beneficiario': 'municipio',
  'municipio': 'municipio',
  'qualificacao': 'qualificacao',
  'nr emenda beneficiario': 'nr_emenda',
  'n emenda beneficiario': 'nr_emenda',
  'parlamentar beneficiario': 'parlamentar',
  'cnpj beneficiario': 'cnpj',
  'nome beneficiario': 'nome',
  'nat jur beneficiario': 'natureza_juridica',
  'nat. jur. beneficiario': 'natureza_juridica',
  'contato': 'telefone',
  'email': 'email',
  'valor': 'valor_emenda',
}

function mapHeaders(sampleHeaders) {
  const headerMap = {}
  for (const h of sampleHeaders) {
    const norm = normalizeHeader(h)
    if (CRM_COLUMN_MAP[norm]) { headerMap[h] = CRM_COLUMN_MAP[norm]; continue }
    for (const [key, val] of Object.entries(CRM_COLUMN_MAP)) {
      if (norm.includes(key) || key.includes(norm)) { headerMap[h] = val; break }
    }
  }
  return headerMap
}

function detectAndFixHeaderShift(headerMap, sampleRow) {
  const fixed = { ...headerMap }
  const ufHeader = Object.entries(fixed).find(([_, v]) => v === 'uf')?.[0]
  if (!ufHeader) return fixed

  const sampleUfValue = String(sampleRow[ufHeader] || '').trim()
  if (sampleUfValue.length > 3) {
    const municipioHeaders = Object.entries(fixed).filter(([_, v]) => v === 'municipio')
    let ufDataHeader = null, cityDataHeader = null
    for (const [origHeader] of municipioHeaders) {
      const norm = normalizeHeader(origHeader)
      if (norm.includes('beneficiario')) ufDataHeader = origHeader
      else cityDataHeader = origHeader
    }
    fixed[ufHeader] = 'orgao_concedente'
    if (ufDataHeader) fixed[ufDataHeader] = 'uf'
    if (cityDataHeader) fixed[cityDataHeader] = 'municipio'
  }
  return fixed
}

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

// --- Main ---
async function main() {
  console.log(`Reading: ${XLSX_PATH}`)
  const buffer = readFileSync(XLSX_PATH)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`)

  // Load vendedor users
  const usersRes = await pool.query("SELECT id, email, nome FROM users WHERE role = 'vendedor' AND active = true ORDER BY nome")
  const usersByEmail = {}
  for (const u of usersRes.rows) usersByEmail[u.email] = u.id
  console.log(`Active vendedores: ${usersRes.rows.map(u => `${u.nome} (${u.email})`).join(', ')}`)

  // Load proponentes contact data for enrichment
  const proponentesRes = await pool.query(
    `SELECT cnpj, email, telefone FROM proponentes WHERE email IS NOT NULL OR telefone IS NOT NULL LIMIT 100000`
  ).catch(() => ({ rows: [] }))
  const contactByCnpj = new Map()
  for (const p of proponentesRes.rows) {
    const pCnpj = cleanCNPJ(p.cnpj)
    if (pCnpj) contactByCnpj.set(pCnpj, { email: p.email || null, telefone: p.telefone || null })
  }
  console.log(`Proponentes contacts loaded: ${contactByCnpj.size}`)

  // Load existing clients for flagging
  const clientsRes = await pool.query(
    `SELECT cnpj FROM existing_clients`
  ).catch(() => ({ rows: [] }))
  const existingClients = new Set()
  for (const c of clientsRes.rows) {
    const cCnpj = cleanCNPJ(c.cnpj)
    if (cCnpj) existingClients.add(cCnpj)
  }
  console.log(`Existing clients: ${existingClients.size}`)

  // Track dedup within import
  const seenPairs = new Set()
  const cnpjsNeedingContacts = new Set()
  let totalInserted = 0, totalDuplicates = 0, totalSkipped = 0, totalEnriched = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    if (rawRows.length === 0) { console.log(`  ${sheetName}: empty, skipping`); continue }

    // Resolve vendedor from sheet name
    const normalized = normalizeHeader(sheetName)
    const vendedorEmail = VENDEDOR_MAP[normalized]
    const vendedorId = vendedorEmail ? usersByEmail[vendedorEmail] || null : null
    console.log(`\nSheet: ${sheetName} (${rawRows.length} rows) -> vendedor: ${vendedorEmail || 'UNMATCHED'} (${vendedorId ? 'found' : 'NOT FOUND'})`)

    if (!vendedorId) {
      console.log(`  WARNING: No user found for ${vendedorEmail}. Rows will have vendedor_id = NULL.`)
    }

    const sampleHeaders = Object.keys(rawRows[0])
    const headerMap = detectAndFixHeaderShift(mapHeaders(sampleHeaders), rawRows[0])
    console.log(`  Mapped columns: ${JSON.stringify(headerMap)}`)

    let inserted = 0, duplicates = 0, skipped = 0, enriched = 0

    for (const raw of rawRows) {
      const row = {}
      for (const [orig, mapped] of Object.entries(headerMap)) {
        row[mapped] = raw[orig]
      }

      // Extract data from unnamed columns (__EMPTY, etc.)
      for (const [key, val] of Object.entries(raw)) {
        if (!key.startsWith('__EMPTY') || !val || String(val).trim() === '') continue
        const strVal = String(val).trim()
        if (strVal.includes('@') && !row.email) row.email = strVal
        else if (/^[\d\s\-().+]+$/.test(strVal) && strVal.replace(/\D/g, '').length >= 8 && !row.telefone) row.telefone = strVal
      }

      const cnpj = cleanCNPJ(row.cnpj)
      if (!cnpj) { skipped++; continue }

      // Dedup: full row identity (cnpj + parlamentar + link_externo)
      const parlamentar = row.parlamentar ? String(row.parlamentar).trim() : ''
      const linkExterno = row.link_externo ? String(row.link_externo).trim() : ''
      const dedupKey = `${cnpj}|${parlamentar}|${linkExterno}`
      if (seenPairs.has(dedupKey)) { duplicates++; continue }

      // Prefer spreadsheet contact > proponentes contact
      const spreadsheetTelefone = row.telefone ? String(row.telefone).trim() : null
      const spreadsheetEmail = row.email ? String(row.email).trim() : null
      const contact = contactByCnpj.get(cnpj)
      let finalTelefone = spreadsheetTelefone || contact?.telefone || null
      let finalEmail = spreadsheetEmail || contact?.email || null
      if (contact || spreadsheetTelefone || spreadsheetEmail) enriched++

      // Format phone
      if (finalTelefone) {
        const digits = finalTelefone.replace(/\D/g, '')
        if (digits.length >= 10) finalTelefone = formatPhone(finalTelefone)
      }

      // Flag existing clients
      const isExisting = existingClients.has(cnpj)
      const obs = isExisting ? '⚠️ JA E CLIENTE PROJETUS' : null

      const str = (key) => row[key] ? String(row[key]).trim() : null
      const num = (key) => parseNumeric(row[key])

      const values = [
        vendedorId,
        str('codigo_programa'),
        str('nome_programa'),
        str('link_externo'),
        str('orgao_concedente'),
        str('uf') ? String(row.uf).trim().toUpperCase() : null,
        str('municipio'),
        str('qualificacao'),
        str('nr_emenda'),
        str('parlamentar'),
        cnpj,
        str('nome') || 'Sem nome',
        str('natureza_juridica'),
        num('valor_emenda'),
        num('valor_global'),
        num('valor_empenhado'),
        num('valor_liberado'),
        str('nr_convenio'),
        str('objeto'),
        str('modalidade'),
        str('situacao'),
        num('saldo_conta'),
        finalTelefone,
        finalEmail,
        obs,
        'crm',
      ]

      try {
        await pool.query(INSERT_SQL, values)
        inserted++
        seenPairs.add(dedupKey)
        if (!finalTelefone && !finalEmail) cnpjsNeedingContacts.add(cnpj)
      } catch (err) {
        console.error(`  Insert error CNPJ ${cnpj}: ${err.message}`)
        skipped++
      }
    }

    totalInserted += inserted
    totalDuplicates += duplicates
    totalSkipped += skipped
    totalEnriched += enriched
    console.log(`  Result: ${inserted} inserted, ${duplicates} duplicates, ${skipped} skipped, ${enriched} enriched`)
  }

  console.log(`\n=== IMPORT SUMMARY ===`)
  console.log(`Total inserted: ${totalInserted}`)
  console.log(`Total duplicates: ${totalDuplicates}`)
  console.log(`Total skipped: ${totalSkipped}`)
  console.log(`Total enriched from proponentes: ${totalEnriched}`)
  console.log(`CNPJs needing BrasilAPI enrichment: ${cnpjsNeedingContacts.size}`)

  // BrasilAPI enrichment for missing contacts (no limit since running locally)
  if (cnpjsNeedingContacts.size > 0) {
    console.log(`\n=== BRASILAPI ENRICHMENT ===`)
    let apiEnriched = 0, apiNoData = 0, apiErrors = 0
    const cnpjsArr = Array.from(cnpjsNeedingContacts)

    for (let i = 0; i < cnpjsArr.length; i++) {
      const cnpj = cnpjsArr[i]
      if (i % 20 === 0) console.log(`  Processing ${i + 1}/${cnpjsArr.length}...`)

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

        if (!phone && !email) { apiNoData++; await delay(500); continue }

        const updates = []
        const params = []
        let idx = 1
        if (phone) { updates.push(`telefone = $${idx++}`); params.push(phone) }
        if (email) { updates.push(`email = $${idx++}`); params.push(email) }
        updates.push('updated_at = NOW()')
        params.push(cnpj)

        await pool.query(
          `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx} AND (telefone IS NULL OR telefone = '')`,
          params
        )
        apiEnriched++
      } catch (err) {
        apiErrors++
      }
      await delay(500)
    }

    console.log(`BrasilAPI: ${apiEnriched} enriched, ${apiNoData} no data, ${apiErrors} errors`)
  }

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN telefone IS NOT NULL AND telefone != '' THEN 1 END) as with_phone,
      COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as with_email,
      COUNT(CASE WHEN (telefone IS NOT NULL AND telefone != '') OR (email IS NOT NULL AND email != '') THEN 1 END) as with_any_contact,
      COUNT(CASE WHEN link_externo IS NOT NULL AND link_externo != '' THEN 1 END) as with_link
    FROM vendedor_projetos
  `)
  const s = stats.rows[0]
  console.log(`\n=== FINAL DB STATE ===`)
  console.log(`Total leads: ${s.total}`)
  console.log(`With phone: ${s.with_phone}`)
  console.log(`With email: ${s.with_email}`)
  console.log(`With any contact: ${s.with_any_contact}`)
  console.log(`With TransfereGov link: ${s.with_link}`)

  // Per-vendedor breakdown
  const vendedorStats = await pool.query(`
    SELECT u.nome, COUNT(*) as leads,
      COUNT(CASE WHEN vp.telefone IS NOT NULL AND vp.telefone != '' THEN 1 END) as with_phone,
      COUNT(CASE WHEN vp.email IS NOT NULL AND vp.email != '' THEN 1 END) as with_email
    FROM vendedor_projetos vp
    LEFT JOIN users u ON u.id = vp.vendedor_id
    GROUP BY u.nome ORDER BY u.nome
  `)
  console.log(`\nPer-vendedor:`)
  for (const v of vendedorStats.rows) {
    console.log(`  ${v.nome || 'UNASSIGNED'}: ${v.leads} leads, ${v.with_phone} phones, ${v.with_email} emails`)
  }

  // Sample TransfereGov links
  const links = await pool.query(`
    SELECT cnpj, nome, link_externo FROM vendedor_projetos
    WHERE link_externo IS NOT NULL AND link_externo != ''
    LIMIT 5
  `)
  if (links.rows.length > 0) {
    console.log(`\nSample TransfereGov links:`)
    for (const l of links.rows) {
      console.log(`  ${l.cnpj} (${l.nome}): ${l.link_externo}`)
    }
  }

  await pool.end()
  console.log('\nDone!')
}

main().catch(err => { console.error(err); process.exit(1) })
