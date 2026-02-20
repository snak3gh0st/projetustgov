import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ 
  connectionString: 'postgres://postgres.rdhzvxljvalesaxjdlav:HpnZxm5B1rK8K5Js@aws-1-us-east-1.pooler.supabase.com:6543/postgres', 
  ssl: { rejectUnauthorized: false } 
});

function formatPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    const ddd = digits.slice(1, 3);
    if (parseInt(ddd) >= 11) digits = digits.slice(1);
  }
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length >= 8) return raw;
  return null;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const client = await pool.connect();
  let enriched = 0, api_ok = 0, api_err = 0;

  try {
    // Get all sem-nome CNPJs (unique)
    const res = await client.query(`
      SELECT DISTINCT cnpj FROM vendedor_projetos
      WHERE nome IS NULL OR nome = '' OR nome = 'Sem nome'
      ORDER BY cnpj
    `);
    const cnpjs = res.rows.map(r => r.cnpj);
    console.log(`Processing ${cnpjs.length} sem-nome CNPJs...`);

    for (let i = 0; i < cnpjs.length; i++) {
      const cnpj = cnpjs[i];

      try {
        const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjetusCRM/1.0)' }
        });
        
        if (!apiRes.ok) { api_err++; await delay(300); continue; }
        
        const data = await apiRes.json();
        const nome = data.razao_social || data.nome_fantasia || null;
        const phone = formatPhone(data.ddd_telefone_1 || '');
        const phone2 = formatPhone(data.ddd_telefone_2 || '');
        const rawEmail = (data.email || '').trim().toLowerCase();
        const email = rawEmail && rawEmail !== 'none' && rawEmail.includes('@') ? rawEmail : null;
        const addrParts = [data.logradouro, data.numero !== 'S/N' ? data.numero : null, data.complemento, data.bairro].filter(Boolean);
        const cep = data.cep ? String(data.cep).replace(/\D/g, '') : null;
        const endereco = addrParts.length > 0 ? addrParts.join(', ') + (cep ? ` - CEP ${cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : '') : null;
        const apiUf = data.uf || null;
        const apiMunicipio = data.municipio || null;

        if (!nome && !phone && !email && !endereco) { api_ok++; await delay(300); continue; }

        const updates = [];
        const params = [];
        let idx = 1;
        if (nome) { updates.push(`nome = CASE WHEN nome IS NULL OR nome = '' OR nome = 'Sem nome' THEN $${idx++} ELSE nome END`); params.push(nome); }
        if (phone) { updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx++})`); params.push(phone); }
        if (email) { updates.push(`email = COALESCE(NULLIF(email, ''), $${idx++})`); params.push(email); }
        if (endereco) { updates.push(`endereco = COALESCE(NULLIF(endereco, ''), $${idx++})`); params.push(endereco); }
        if (apiUf) { updates.push(`uf = COALESCE(NULLIF(uf, ''), $${idx++})`); params.push(apiUf); }
        if (apiMunicipio) { updates.push(`municipio = COALESCE(NULLIF(municipio, ''), $${idx++})`); params.push(apiMunicipio); }
        updates.push('updated_at = NOW()');
        params.push(cnpj);

        await client.query(`UPDATE vendedor_projetos SET ${updates.join(', ')} WHERE cnpj = $${idx}`, params);
        
        // Also insert into lead_contacts if phone/email found and no contact exists
        if (phone || email) {
          await client.query(`
            INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
            SELECT $1, $2, $3, true, 'desconhecido'
            WHERE NOT EXISTS (SELECT 1 FROM lead_contacts WHERE lead_cnpj = $1)
            ON CONFLICT DO NOTHING
          `, [cnpj, phone || null, email || null]);
        }
        if (phone2 && phone2 !== phone) {
          await client.query(`
            INSERT INTO lead_contacts (lead_cnpj, telefone, email, principal, telefone_status)
            SELECT $1, $2, NULL, false, 'desconhecido'
            WHERE EXISTS (SELECT 1 FROM lead_contacts WHERE lead_cnpj = $1)
            ON CONFLICT DO NOTHING
          `, [cnpj, phone2]);
        }
        
        enriched++;
        api_ok++;
      } catch(e) {
        api_err++;
      }

      if ((i + 1) % 30 === 0) {
        console.log(`  ${i+1}/${cnpjs.length} | enriched: ${enriched} | errors: ${api_err}`);
      }
      await delay(350);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\nFIM: ${enriched} CNPJs enriquecidos, ${api_ok} BrasilAPI ok, ${api_err} erros`);
}

run().catch(console.error);
