/**
 * Automatic lead distribution script
 * Distributes all unassigned leads evenly across active vendedores using round-robin
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
    envVars[match[1]] = match[2]
  }
})

const pool = new Pool({
  connectionString: envVars.DATABASE_URL || envVars.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
})

async function distributeLeads() {
  try {
    console.log('🔍 Fetching active vendedores...')

    // Get all active vendedores
    const vendedoresResult = await pool.query(`
      SELECT id, nome, email,
        (SELECT COUNT(*) FROM vendedor_projetos WHERE vendedor_id = users.id) as lead_count
      FROM users
      WHERE role = 'vendedor' AND active = true
      ORDER BY nome
    `)

    const vendedores = vendedoresResult.rows

    if (vendedores.length === 0) {
      console.log('❌ No active vendedores found!')
      process.exit(1)
    }

    console.log(`\n✅ Found ${vendedores.length} active vendedores:`)
    vendedores.forEach(v => {
      console.log(`   - ${v.nome} (${v.email}): ${v.lead_count} leads`)
    })

    console.log('\n🔍 Fetching unassigned leads...')

    // Get all unassigned leads grouped by CNPJ
    const leadsResult = await pool.query(`
      SELECT DISTINCT ON (cnpj)
        id, cnpj, nome,
        (SELECT COUNT(*) FROM vendedor_projetos WHERE cnpj = vp.cnpj) as emenda_count
      FROM vendedor_projetos vp
      WHERE vendedor_id IS NULL
      ORDER BY cnpj, id
    `)

    const unassignedCNPJs = leadsResult.rows

    if (unassignedCNPJs.length === 0) {
      console.log('✅ No unassigned leads found! All leads are already assigned.')
      process.exit(0)
    }

    console.log(`\n✅ Found ${unassignedCNPJs.length} unassigned CNPJs`)

    // Calculate total leads (counting all emendas)
    const totalLeads = unassignedCNPJs.reduce((sum, lead) => sum + lead.emenda_count, 0)
    console.log(`   Total leads (including emendas): ${totalLeads}`)

    console.log('\n🎲 Distributing leads using round-robin...\n')

    // Round-robin distribution
    let vendedorIndex = 0
    let assigned = 0

    for (const lead of unassignedCNPJs) {
      const vendedor = vendedores[vendedorIndex]

      // Assign all leads for this CNPJ to the selected vendedor
      const result = await pool.query(`
        UPDATE vendedor_projetos
        SET vendedor_id = $1, updated_at = NOW()
        WHERE cnpj = $2 AND vendedor_id IS NULL
      `, [vendedor.id, lead.cnpj])

      const rowsUpdated = result.rowCount
      assigned += rowsUpdated

      console.log(`   ✓ ${lead.nome} (${lead.cnpj}) → ${vendedor.nome} (${rowsUpdated} leads)`)

      // Move to next vendedor (round-robin)
      vendedorIndex = (vendedorIndex + 1) % vendedores.length
    }

    console.log(`\n✅ Distribution complete!`)
    console.log(`   Total CNPJs assigned: ${unassignedCNPJs.length}`)
    console.log(`   Total leads assigned: ${assigned}`)

    // Show final distribution
    console.log('\n📊 Final distribution:')
    const finalResult = await pool.query(`
      SELECT u.nome, u.email, COUNT(*) as lead_count
      FROM vendedor_projetos vp
      JOIN users u ON vp.vendedor_id = u.id
      WHERE u.role = 'vendedor'
      GROUP BY u.id, u.nome, u.email
      ORDER BY u.nome
    `)

    finalResult.rows.forEach(v => {
      console.log(`   - ${v.nome}: ${v.lead_count} leads`)
    })

    process.exit(0)

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

distributeLeads()
