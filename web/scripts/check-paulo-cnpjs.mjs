import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cnpjs = JSON.parse(readFileSync('/tmp/cnpjs-clientes.json', 'utf8'));

const pool = new Pool({
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
});

// Check columns
const colRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='vendedor_projetos' ORDER BY ordinal_position LIMIT 10`);
console.log('Columns:', colRes.rows.map(r => r.column_name));

// Check which CNPJs are in vendedor_projetos (by distinct CNPJ)
const inDbRes = await pool.query(
  `SELECT DISTINCT vp.cnpj, vp.vendedor_id, u.nome as vendedor_nome 
   FROM vendedor_projetos vp
   LEFT JOIN users u ON u.id = vp.vendedor_id
   WHERE vp.cnpj = ANY($1::text[])
   ORDER BY vp.cnpj`,
  [cnpjs]
);
console.log('\nDistinct CNPJs found in DB:', inDbRes.rows.length, 'of', cnpjs.length);

// Count by vendedor
const byVendedor = {};
for (const row of inDbRes.rows) {
  const k = row.vendedor_nome || 'unassigned';
  byVendedor[k] = (byVendedor[k] || 0) + 1;
}
console.log('By vendedor:', byVendedor);

// CNPJs NOT in DB
const inDbSet = new Set(inDbRes.rows.map(r => r.cnpj));
const notInDb = cnpjs.filter(c => !inDbSet.has(c));
console.log('\nCNPJs NOT in DB:', notInDb.length);

await pool.end();
