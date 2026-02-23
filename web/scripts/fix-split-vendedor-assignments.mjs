// Fix: Re-assign all emenda rows for a CNPJ to the same vendedor.
// Strategy: for each CNPJ with rows split across multiple vendedores,
// pick the "primary" vendedor (earliest created row) and reassign all others to them.
// Exception: if a row has a non-"Não Contatado" status, that vendedor takes priority
// (they're actively working the lead).

import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const client = await pool.connect();

try {
  // Find all CNPJs with rows under multiple distinct vendedores
  const splitRes = await client.query(`
    SELECT cnpj
    FROM vendedor_projetos
    GROUP BY cnpj
    HAVING COUNT(DISTINCT COALESCE(vendedor_id::text, 'NULL')) > 1
  `);
  
  const splitCnpjs = splitRes.rows.map(r => r.cnpj);
  console.log(`Found ${splitCnpjs.length} CNPJs with split vendedor assignments`);
  
  let fixed = 0;
  let skipped = 0;
  
  for (const cnpj of splitCnpjs) {
    // Get all rows for this CNPJ, ordered by engagement (active status first, then earliest)
    const rowsRes = await client.query(`
      SELECT id, vendedor_id, status_contato, created_at,
        CASE status_contato
          WHEN 'Fechado' THEN 1
          WHEN 'Proposta' THEN 2
          WHEN 'Aguardando Closer' THEN 3
          WHEN 'Retorno' THEN 4
          WHEN 'Ainda Não' THEN 5
          WHEN 'Não Contatado' THEN 7
          WHEN 'Telefone Invalido' THEN 8
          ELSE 9
        END as status_priority
      FROM vendedor_projetos
      WHERE cnpj = $1 AND vendedor_id IS NOT NULL
      ORDER BY status_priority ASC, created_at ASC
    `, [cnpj]);
    
    if (rowsRes.rows.length === 0) {
      skipped++;
      continue;
    }
    
    // Primary vendedor: row with best engagement status (lowest priority number), tie-broken by earliest created_at
    const primaryVendedorId = rowsRes.rows[0].vendedor_id;
    const primaryStatus = rowsRes.rows[0].status_contato;
    
    // Check if any rows need reassignment
    const needsUpdate = rowsRes.rows.filter(r => r.vendedor_id !== primaryVendedorId);
    
    if (needsUpdate.length === 0) {
      skipped++;
      continue;
    }
    
    // Get names for logging
    const nameRes = await client.query(
      `SELECT nome FROM vendedor_projetos WHERE cnpj = $1 LIMIT 1`, [cnpj]
    );
    const userRes = await client.query(
      `SELECT id, nome FROM users WHERE id = ANY($1::uuid[])`,
      [rowsRes.rows.map(r => r.vendedor_id)]
    );
    const userMap = {};
    for (const u of userRes.rows) userMap[u.id] = u.nome;
    
    const orgName = nameRes.rows[0]?.nome || cnpj;
    const primaryName = userMap[primaryVendedorId] || primaryVendedorId;
    
    console.log(`\nCNPJ: ${cnpj} - ${orgName}`);
    console.log(`  Primary: ${primaryName} (status: ${primaryStatus})`);
    for (const row of needsUpdate) {
      console.log(`  Reassigning id=${row.id} from ${userMap[row.vendedor_id] || row.vendedor_id} (${row.status_contato}) -> ${primaryName}`);
    }
    
    // Reassign all non-primary rows
    const idsToUpdate = needsUpdate.map(r => r.id);
    await client.query(
      `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])`,
      [primaryVendedorId, idsToUpdate]
    );
    
    fixed++;
  }
  
  console.log(`\n=== DONE ===`);
  console.log(`Fixed: ${fixed} CNPJs`);
  console.log(`Skipped (already consistent): ${skipped} CNPJs`);
  
} finally {
  client.release();
  await pool.end();
}
