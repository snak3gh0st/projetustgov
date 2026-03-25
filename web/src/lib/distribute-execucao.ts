import { query } from './db'

export interface DistributeResult {
  distributed: number
  updated: number
  inserted: number
  vendedores: { nome: string; before: number; assigned: number; after: number }[]
}

/**
 * Round-robin distribution of unassigned execucao CNPJs among active vendedores.
 * Called automatically after sync-execucao cron job.
 */
export async function distributeUnassignedExecucao(): Promise<DistributeResult> {
  // 1. Get active vendedores with their current execucao lead count
  const vendedores = await query<{ id: string; nome: string; current_count: number }>(`
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
  const unassigned = await query<{ cnpj: string; nome_proponente: string }>(`
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

  // 3. Round-robin: assign to vendedor with fewest leads
  const counts = new Map(vendedores.map(v => [v.id, v.current_count]))
  const assignments: { cnpj: string; nome: string; vendedor_id: string }[] = []

  for (const lead of unassigned) {
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

  // 4. Execute: update existing or insert new vendedor_projetos rows
  let updated = 0
  let inserted = 0

  for (const a of assignments) {
    const existing = await query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1`,
      [a.cnpj]
    )

    if (existing[0].cnt > 0) {
      await query(
        `UPDATE vendedor_projetos SET vendedor_id = $1, updated_at = NOW()
         WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $2 AND vendedor_id IS NULL`,
        [a.vendedor_id, a.cnpj]
      )
      updated++
    } else {
      await query(
        `INSERT INTO vendedor_projetos (cnpj, nome, vendedor_id, status_contato, created_at, updated_at)
         VALUES ($1, $2, $3, 'Não Contatado', NOW(), NOW())`,
        [a.cnpj, a.nome, a.vendedor_id]
      )
      inserted++
    }
  }

  const summary = vendedores.map(v => ({
    nome: v.nome,
    before: v.current_count,
    assigned: assignments.filter(a => a.vendedor_id === v.id).length,
    after: counts.get(v.id)!,
  }))

  return { distributed: assignments.length, updated, inserted, vendedores: summary }
}
