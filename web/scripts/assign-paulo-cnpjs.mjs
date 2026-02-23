// Assign CNPJs from CLIENTES.xlsx to Paulo (gestor_vendedor)
// - CNPJs in DB: reassign all rows to Paulo
// - CNPJs not in DB: report as not found

import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const cnpjs = JSON.parse(readFileSync('/tmp/cnpjs-clientes.json', 'utf8'));
const PAULO_ID = '8d78f046-f44f-4ed4-a3b8-c5d30308fbf0';

const pool = new Pool({
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
});

// Get all CNPJs in DB from our list
const inDbRes = await pool.query(
  `SELECT DISTINCT vp.cnpj, vp.vendedor_id, u.nome as vendedor_nome 
   FROM vendedor_projetos vp
   LEFT JOIN users u ON u.id = vp.vendedor_id
   WHERE vp.cnpj = ANY($1::text[])
   ORDER BY vp.cnpj`,
  [cnpjs]
);

const inDbCnpjs = inDbRes.rows;
const inDbSet = new Set(inDbCnpjs.map(r => r.cnpj));
const notInDb = cnpjs.filter(c => !inDbSet.has(c));

// Separate: already Paulo's vs need reassignment
const alreadyPaulo = inDbCnpjs.filter(r => r.vendedor_id === PAULO_ID);
const needReassign = inDbCnpjs.filter(r => r.vendedor_id !== PAULO_ID);

console.log(`=== CNPJ Assignment to Paulo ===`);
console.log(`Total CNPJs in file: ${cnpjs.length}`);
console.log(`Found in DB: ${inDbCnpjs.length}`);
console.log(`  - Already Paulo's: ${alreadyPaulo.length}`);
console.log(`  - Need reassignment: ${needReassign.length}`);
console.log(`Not in DB: ${notInDb.length}`);

if (needReassign.length > 0) {
  console.log('\nReassigning:');
  for (const row of needReassign) {
    console.log(`  ${row.cnpj} (from ${row.vendedor_nome || 'unassigned'})`);
  }
  
  const cnpjsToReassign = needReassign.map(r => r.cnpj);
  const updateRes = await pool.query(
    `UPDATE vendedor_projetos 
     SET vendedor_id = $1, updated_at = NOW()
     WHERE cnpj = ANY($2::text[])`,
    [PAULO_ID, cnpjsToReassign]
  );
  console.log(`\nUpdated ${updateRes.rowCount} rows in vendedor_projetos`);
}

if (notInDb.length > 0) {
  console.log(`\nNot found in DB (${notInDb.length} CNPJs):`);
  notInDb.forEach(c => console.log(`  ${c}`));
}

console.log('\nDone!');
await pool.end();
