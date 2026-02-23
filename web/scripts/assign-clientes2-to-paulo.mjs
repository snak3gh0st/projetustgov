import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const PAULO_ID = '8d78f046-f44f-4ed4-a3b8-c5d30308fbf0';

const pool = new Pool({
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
});

const clients = JSON.parse(readFileSync('/tmp/clientes2.json', 'utf8'));
const cnpjs = clients.map(c => c.cnpj);
console.log(`Processing ${cnpjs.length} CNPJs from CLIENTES-2.xlsx`);

// 1. Remove from existing_clients
const delRes = await pool.query(
  `DELETE FROM existing_clients WHERE cnpj = ANY($1::text[])`,
  [cnpjs]
);
console.log(`\nRemoved ${delRes.rowCount} from existing_clients`);

// 2. Check which are in vendedor_projetos
const inDbRes = await pool.query(
  `SELECT DISTINCT vp.cnpj, vp.vendedor_id, u.nome as vendedor_nome
   FROM vendedor_projetos vp
   LEFT JOIN users u ON u.id = vp.vendedor_id
   WHERE vp.cnpj = ANY($1::text[])`,
  [cnpjs]
);
const inDbSet = new Set(inDbRes.rows.map(r => r.cnpj));
const notInDb = cnpjs.filter(c => !inDbSet.has(c));
const alreadyPaulo = inDbRes.rows.filter(r => r.vendedor_id === PAULO_ID);
const needReassign = inDbRes.rows.filter(r => r.vendedor_id !== PAULO_ID);

console.log(`\nIn DB: ${inDbRes.rows.length} | Already Paulo's: ${alreadyPaulo.length} | Need reassign: ${needReassign.length} | Not in DB: ${notInDb.length}`);

// 3. Reassign to Paulo
if (needReassign.length > 0) {
  const toReassign = needReassign.map(r => r.cnpj);
  const updRes = await pool.query(
    `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW() WHERE cnpj = ANY($2::text[])`,
    [PAULO_ID, toReassign]
  );
  console.log(`Reassigned ${updRes.rowCount} rows to Paulo`);
  for (const r of needReassign) console.log(`  ${r.cnpj} (from ${r.vendedor_nome || 'unassigned'})`);
}

console.log(`\nNot in DB (${notInDb.length}): leads não existem no sistema ainda`);
console.log('Done!');
await pool.end();
