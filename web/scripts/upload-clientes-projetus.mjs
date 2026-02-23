// Upload existing Projetus clients from CLIENTES-2.xlsx to existing_clients table
import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
});

// Check existing_clients structure
const colRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='existing_clients' ORDER BY ordinal_position`);
console.log('Columns:', colRes.rows.map(r => r.column_name));

const countBefore = await pool.query(`SELECT COUNT(*) FROM existing_clients`);
console.log('Existing clients before:', countBefore.rows[0].count);

const clients = JSON.parse(readFileSync('/tmp/clientes2.json', 'utf8'));
console.log(`\nUploading ${clients.length} clients from CLIENTES-2.xlsx...`);

// UPSERT: insert new, skip duplicates
let inserted = 0, skipped = 0;
for (const { cnpj, nome } of clients) {
  const cols = colRes.rows.map(r => r.column_name);
  const hasNome = cols.includes('nome') || cols.includes('nome_fantasia') || cols.includes('razao_social');
  
  let res;
  if (hasNome) {
    const nomeCol = cols.includes('nome') ? 'nome' : cols.includes('nome_fantasia') ? 'nome_fantasia' : 'razao_social';
    res = await pool.query(
      `INSERT INTO existing_clients (cnpj, ${nomeCol}) VALUES ($1, $2) ON CONFLICT (cnpj) DO NOTHING`,
      [cnpj, nome]
    );
  } else {
    res = await pool.query(
      `INSERT INTO existing_clients (cnpj) VALUES ($1) ON CONFLICT (cnpj) DO NOTHING`,
      [cnpj]
    );
  }
  if (res.rowCount > 0) inserted++;
  else skipped++;
}

const countAfter = await pool.query(`SELECT COUNT(*) FROM existing_clients`);
console.log(`\nResults:`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Skipped (already existed): ${skipped}`);
console.log(`  Total existing_clients: ${countAfter.rows[0].count}`);

await pool.end();
