/**
 * One-shot bulk reassignment script
 * Assigns a specific list of 73 CNPJs to Paulo (paulo@projetus.org) in vendedor_projetos
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    // Strip surrounding quotes if present
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    envVars[match[1]] = value
  }
})

const pool = new Pool({
  connectionString: envVars.DATABASE_URL || envVars.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
})

const TARGET_CNPJS = [
  '08865455000181','11458210000144','38307313000160','27851981000137','26509885000142',
  '05740074000188','07388151000108','46203548000130','08792836000188','29830688000119',
  '20072173000122','28786425000197','07001227000109','19434527000152','10698627000111',
  '17691694000153','11423403000160','02560548000111','03412091000160','51561819000169',
  '02254698000105','36355443000142','08466173000101','05600136000156','01033253000124',
  '00204349000145','32005699000179','17652052000145','00102556000199','19592920000174',
  '16807889000153','01718634000147','27959638000100','10408525000114','28735847000133',
  '23863410000161','18133211000168','40696176000144','08836901000120','08331438000164',
  '06186691000146','09340727000192','10569203000157','01038483000186','11179956000119',
  '09299439000131','31840523000170','07408794000176','11881500000104','10935772000179',
  '10802204000108','05312072000198','03621549000191','05429826000194','07577063000154',
  '41771121000114','35393233000186','24164662000165','23291629000133','03637196000118',
  '04093667000137','17704372000100','05994449000136','29426258000136','05283553000112',
  '46758416000174','42165949000191','74087016000110','17982835000197','29084014000112',
  '24649294000145','22415807000128','00455609000155'
]

async function assignPauloCnpjs() {
  try {
    // Step 1: Look up Paulo's user ID
    console.log('Looking up paulo@projetus.org...')
    const userResult = await pool.query(
      `SELECT id, nome, email FROM users WHERE email = 'paulo@projetus.org'`
    )

    if (userResult.rows.length === 0) {
      console.error('ERROR: User paulo@projetus.org not found in database.')
      process.exit(1)
    }

    const paulo = userResult.rows[0]
    console.log(`Paulo user ID: ${paulo.id} (${paulo.nome})`)
    console.log(`Target CNPJs: ${TARGET_CNPJS.length}`)

    // Step 2: Run the bulk UPDATE
    console.log('\nRunning UPDATE...')
    const updateResult = await pool.query(
      `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE cnpj = ANY($2)`,
      [paulo.id, TARGET_CNPJS]
    )
    console.log(`Rows updated: ${updateResult.rowCount}`)

    // Step 3: Confirm which CNPJs were actually assigned
    const confirmResult = await pool.query(
      `SELECT DISTINCT cnpj FROM vendedor_projetos WHERE cnpj = ANY($1) AND vendedor_id = $2`,
      [TARGET_CNPJS, paulo.id]
    )
    const confirmedCnpjs = new Set(confirmResult.rows.map(r => r.cnpj))
    console.log(`CNPJs confirmed assigned: ${confirmedCnpjs.size}`)

    // Step 4: Compute missing CNPJs (in target list but not confirmed in DB)
    const notFound = TARGET_CNPJS.filter(cnpj => !confirmedCnpjs.has(cnpj))
    if (notFound.length === 0) {
      console.log('CNPJs NOT found in DB: none')
    } else {
      console.log(`CNPJs NOT found in DB (${notFound.length}):`)
      notFound.forEach(cnpj => console.log(`  - ${cnpj}`))
    }

    process.exit(0)

  } catch (error) {
    console.error('ERROR:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

assignPauloCnpjs()
