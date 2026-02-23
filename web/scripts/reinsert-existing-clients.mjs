import { readFileSync } from 'fs';
import pg from 'pg';
const { Pool } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({ connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' });
const clients = JSON.parse(readFileSync('/tmp/clientes2.json', 'utf8'));

let inserted = 0;
for (const { cnpj, nome } of clients) {
  const res = await pool.query(
    `INSERT INTO existing_clients (cnpj, nome) VALUES ($1, $2) ON CONFLICT (cnpj) DO NOTHING`,
    [cnpj, nome]
  );
  if (res.rowCount > 0) inserted++;
}

const count = await pool.query(`SELECT COUNT(*) FROM existing_clients`);
console.log(`Reinseridos: ${inserted} | Total existing_clients: ${count.rows[0].count}`);
await pool.end();
