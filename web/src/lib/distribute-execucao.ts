import { getPool } from './db'
import { AUTO_DISTRIBUTION_ENABLED } from './distribution-policy'

export interface DistributeResult {
  distributed: number
  updated: number
  inserted: number
  skipped?: boolean
  vendedores: { nome: string; before: number; assigned: number; after: number }[]
  coordenador?: { nome: string; assigned: number }
}

/**
 * Phase 18 distribution lock key. Unique integer to avoid collision with other
 * pg_advisory_lock usages in the system (e.g. repo-sync, execucao-sync).
 */
const DISTRIBUTE_LOCK_KEY = 19876543210

/**
 * Round-robin distribution of unassigned execucao CNPJs among active vendedores.
 * Client CNPJs (found in existing_clients table) are routed to the current lead manager
 * instead of entering the equalization queue.
 *
 * Uses pg_try_advisory_lock on a dedicated connection to prevent double-assignment
 * between the cron job and the manual UI trigger. If the lock is already held,
 * returns { skipped: true } immediately.
 *
 * Called automatically after sync-execucao cron job and via POST /api/execucao/distribute.
 */
export async function distributeUnassignedExecucao(): Promise<DistributeResult> {
  if (!AUTO_DISTRIBUTION_ENABLED) {
    console.log('[distribute-execucao] Auto distribution disabled; skipping round-robin assignment')
    return { distributed: 0, updated: 0, inserted: 0, vendedores: [], skipped: true }
  }

  console.log('[distribute-execucao] Attempting advisory lock...')
  const client = await getPool().connect()
  try {
    // Acquire session-level advisory lock — returns false immediately if already held
    const { rows: [{ acquired }] } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [DISTRIBUTE_LOCK_KEY]
    )
    if (!acquired) {
      console.log('[distribute-execucao] Lock already held, skipping')
      return { distributed: 0, updated: 0, inserted: 0, vendedores: [], skipped: true }
    }
    console.log('[distribute-execucao] Lock acquired, starting distribution')

    try {
      // 1. Get active vendedores with their current execucao lead count
      const { rows: vendedores } = await client.query<{ id: string; nome: string; current_count: number }>(`
        SELECT u.id, u.nome,
          COALESCE((
            SELECT COUNT(DISTINCT REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
            FROM vendedor_projetos vp
            WHERE vp.vendedor_id = u.id
              AND EXISTS (
                SELECT 1 FROM projetos_execucao pe
                WHERE pe.cnpj = REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g')
              )
          ), 0)::int AS current_count
        FROM users u
        WHERE u.active = true AND u.role = 'vendedor'
        ORDER BY u.nome
      `)

      if (vendedores.length === 0) {
        return { distributed: 0, updated: 0, inserted: 0, vendedores: [] }
      }

      // 2. Get unassigned execucao CNPJs
      const { rows: unassigned } = await client.query<{ cnpj: string; nome_proponente: string }>(`
        SELECT DISTINCT pe.cnpj, MAX(pe.nome_proponente) AS nome_proponente
        FROM projetos_execucao pe
        WHERE NOT EXISTS (
          SELECT 1 FROM vendedor_projetos vp
          WHERE REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') = pe.cnpj
            AND vp.vendedor_id IS NOT NULL
        )
        GROUP BY pe.cnpj
        ORDER BY pe.cnpj
      `)

      if (unassigned.length === 0) {
        return { distributed: 0, updated: 0, inserted: 0, vendedores: vendedores.map(v => ({ nome: v.nome, before: v.current_count, assigned: 0, after: v.current_count })) }
      }

      // 3. Client-routing pre-step: find current lead manager and split unassigned CNPJs
      const managerEmail = process.env.PRIMARY_LEAD_MANAGER_EMAIL || 'rooger@projetus.org'
      const { rows: coordRows } = await client.query<{ id: string; nome: string }>(
        `SELECT id, nome FROM users WHERE email = $1 AND active = true LIMIT 1`,
        [managerEmail]
      )
      const coordenador = coordRows[0] ?? null

      if (!coordenador) {
        console.log(`[distribute-execucao] No active lead manager found for ${managerEmail}, client leads will enter round-robin`)
      }

      // Check which unassigned CNPJs are existing clients (normalize both sides)
      const cnpjList = unassigned.map(r => r.cnpj)
      const { rows: clientRows } = await client.query<{ cnpj: string }>(
        `SELECT REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g') AS cnpj
         FROM existing_clients ec
         WHERE REGEXP_REPLACE(ec.cnpj, '[^0-9]', '', 'g') = ANY($1::text[])`,
        [cnpjList]
      )

      const clientCnpjs = new Set(clientRows.map(r => r.cnpj))
      const clientLeads = coordenador ? unassigned.filter(r => clientCnpjs.has(r.cnpj)) : []
      const roundRobinLeads = coordenador
        ? unassigned.filter(r => !clientCnpjs.has(r.cnpj))
        : unassigned

      // 4. Assign client leads to lead manager
      let clientAssigned = 0
      if (coordenador && clientLeads.length > 0) {
        for (const lead of clientLeads) {
          const { rows: existing } = await client.query<{ cnt: number }>(
            `SELECT COUNT(*)::int AS cnt FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1`,
            [lead.cnpj]
          )
          if (existing[0].cnt > 0) {
            await client.query(
              `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW()
               WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $2 AND vendedor_id IS NULL`,
              [coordenador.id, lead.cnpj]
            )
          } else {
            await client.query(
              `INSERT INTO vendedor_projetos (cnpj, nome, vendedor_id, status_contato, created_at, updated_at)
               VALUES ($1, $2, $3, 'Não Contatado', NOW(), NOW())`,
              [lead.cnpj, lead.nome_proponente || 'Sem nome', coordenador.id]
            )
          }
          clientAssigned++
        }
        console.log(`[distribute-execucao] Routed ${clientAssigned} client CNPJs to lead manager ${coordenador.nome}`)
      }

      // 5. Round-robin: assign remaining CNPJs to vendedor with fewest leads
      const counts = new Map(vendedores.map(v => [v.id, v.current_count]))
      const assignments: { cnpj: string; nome: string; vendedor_id: string }[] = []

      for (const lead of roundRobinLeads) {
        let minId = vendedores[0].id
        let minCount = counts.get(minId)!
        for (const v of vendedores) {
          const c = counts.get(v.id)!
          if (c < minCount) {
            minCount = c
            minId = v.id
          }
        }
        assignments.push({ cnpj: lead.cnpj, nome: lead.nome_proponente || 'Sem nome', vendedor_id: minId })
        counts.set(minId, minCount + 1)
      }

      // 6. Execute round-robin assignments: update existing or insert new vendedor_projetos rows
      let updated = 0
      let inserted = 0

      for (const a of assignments) {
        const { rows: existing } = await client.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1`,
          [a.cnpj]
        )

        if (existing[0].cnt > 0) {
          await client.query(
            `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW()
             WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $2 AND vendedor_id IS NULL`,
            [a.vendedor_id, a.cnpj]
          )
          updated++
        } else {
          await client.query(
            `INSERT INTO vendedor_projetos (cnpj, nome, vendedor_id, status_contato, created_at, updated_at)
             VALUES ($1, $2, $3, 'Não Contatado', NOW(), NOW())`,
            [a.cnpj, a.nome, a.vendedor_id]
          )
          inserted++
        }
      }

      console.log(`[distribute-execucao] Round-robin assigned ${assignments.length} CNPJs to ${vendedores.length} vendedores`)

      const summary = vendedores.map(v => ({
        nome: v.nome,
        before: v.current_count,
        assigned: assignments.filter(a => a.vendedor_id === v.id).length,
        after: counts.get(v.id)!,
      }))

      return {
        distributed: assignments.length + clientAssigned,
        updated,
        inserted,
        vendedores: summary,
        coordenador: coordenador ? { nome: coordenador.nome, assigned: clientAssigned } : undefined,
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [DISTRIBUTE_LOCK_KEY])
    }
  } finally {
    client.release()
  }
}
