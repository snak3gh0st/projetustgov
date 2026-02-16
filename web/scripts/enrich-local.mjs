// One-time local enrichment script for CNPJs missing data (contacts + address)
// Run from web/ directory: node scripts/enrich-local.mjs
import { readFileSync } from 'fs'
import pg from 'pg'

// Read DB URL from .env.local
const envContent = readFileSync('.env.local', 'utf8')
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1]
if (!dbUrl) { console.error('No DATABASE_URL found'); process.exit(1) }

const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 2,
  ssl: { rejectUnauthorized: false },
})

function formatPhone(raw) {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  // Strip trunk prefix 0
  if (digits.length === 11 && digits.startsWith('0') && !digits.startsWith('0800')) {
    const ddd = digits.slice(1, 3)
    if (parseInt(ddd) >= 11) digits = digits.slice(1)
  }
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length >= 8) return raw
  return null
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  // Ensure endereco column exists
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendedor_projetos' AND column_name='endereco') THEN
        ALTER TABLE vendedor_projetos ADD COLUMN endereco TEXT;
      END IF;
    END $$;
  `).catch(() => {})

  // Find all CNPJs missing address OR contacts
  const { rows } = await pool.query(`
    SELECT DISTINCT cnpj FROM vendedor_projetos
    WHERE (telefone IS NULL OR telefone = '')
       OR (email IS NULL OR email = '')
       OR (endereco IS NULL OR endereco = '')
    ORDER BY cnpj
  `)
  console.log(`Found ${rows.length} CNPJs needing enrichment (missing contacts or address)`)

  let enriched = 0, noData = 0, errors = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (i % 10 === 0) console.log(`  Processing ${i + 1}/${rows.length}...`)

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${row.cnpj}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' },
      })
      if (!res.ok) {
        console.log(`  ${row.cnpj}: HTTP ${res.status}`)
        errors++
        await delay(500)
        continue
      }
      const data = await res.json()

      const phone = formatPhone(data.ddd_telefone_1)
      const rawEmail = (data.email || '').trim().toLowerCase()
      const email = rawEmail && rawEmail !== 'none' && rawEmail !== 'null' && rawEmail.includes('@') ? rawEmail : null
      const nome = data.razao_social || data.nome_fantasia || null
      const natJur = data.natureza_juridica ? String(data.natureza_juridica).replace(/^\d+\s*-\s*/, '') : null

      // Build address
      const addrParts = [
        data.logradouro,
        data.numero && data.numero !== 'S/N' ? data.numero : null,
        data.complemento,
        data.bairro,
      ].filter(Boolean)
      const cep = data.cep ? String(data.cep).replace(/\D/g, '') : null
      const endereco = addrParts.length > 0
        ? addrParts.join(', ') + (cep ? ` - CEP ${cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : '')
        : null
      const apiUf = data.uf || null
      const apiMunicipio = data.municipio || null

      if (!phone && !email && !endereco && !nome) {
        console.log(`  ${row.cnpj}: no useful data`)
        noData++
        await delay(500)
        continue
      }

      const updates = []
      const params = []
      let idx = 1
      if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx++})`); params.push(phone) }
      if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${idx++})`); params.push(email) }
      if (endereco) { updates.push(`endereco = COALESCE(NULLIF(endereco, ''), $${idx++})`); params.push(endereco) }
      if (apiUf) { updates.push(`uf = COALESCE(NULLIF(uf, ''), $${idx++})`); params.push(apiUf) }
      if (apiMunicipio) { updates.push(`municipio = COALESCE(NULLIF(municipio, ''), $${idx++})`); params.push(apiMunicipio) }
      if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${idx++} ELSE nome END`); params.push(nome) }
      if (natJur) { updates.push(`natureza_juridica = COALESCE(natureza_juridica, $${idx++})`); params.push(natJur) }
      updates.push('updated_at = NOW()')
      params.push(row.cnpj)

      const result = await pool.query(
        `UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx}`,
        params
      )
      enriched++
      console.log(`  ${row.cnpj}: UPDATED ${result.rowCount} rows (phone=${phone || '-'} email=${email || '-'} addr=${endereco ? 'YES' : '-'} uf=${apiUf || '-'})`)
    } catch (err) {
      console.log(`  ${row.cnpj}: ERROR ${err.message}`)
      errors++
    }
    await delay(500)
  }

  console.log(`\nDone: ${enriched} enriched, ${noData} no data, ${errors} errors`)

  // Show remaining
  const { rows: remaining } = await pool.query(`
    SELECT
      COUNT(DISTINCT cnpj) FILTER (WHERE (telefone IS NULL OR telefone = '') AND (email IS NULL OR email = '')) as no_contact,
      COUNT(DISTINCT cnpj) FILTER (WHERE endereco IS NULL OR endereco = '') as no_address
    FROM vendedor_projetos
  `)
  console.log(`Remaining without contact: ${remaining[0].no_contact}`)
  console.log(`Remaining without address: ${remaining[0].no_address}`)

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
