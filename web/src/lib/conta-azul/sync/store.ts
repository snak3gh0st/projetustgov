import 'server-only'
import type { PoolClient } from 'pg'
import { getPool, query } from '@/lib/db'
import {
  baixasFromDetail,
  parcelaFromDetail,
  rateioFromEvento,
  type CategoriaRow,
  type CentroCustoRow,
  type ContaFinanceiraRow,
  type PessoaRow,
} from '../finance/derive'
import type { DreLinha } from '../finance/dre'
import type { BuscaRow, StoredMeta, Tipo } from '../finance/types'

/**
 * Database writes for the Conta Azul pull sync. Timestamps that come from
 * Conta Azul are read back with to_char so they compare as plain strings
 * (node-pg would otherwise turn TIMESTAMP into a local-time Date).
 */

const TS_FMT = `'YYYY-MM-DD"T"HH24:MI:SS'`
const BATCH = 500

function chunks<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export async function getActiveConnectionId(tenantKey: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM conta_azul_connections WHERE tenant_key = $1 AND status = 'active' LIMIT 1`,
    [tenantKey]
  )
  return rows[0]?.id ?? null
}

export type ConnectionRow = { id: string; status: string; company_name: string | null }

/** The tenant connection in any status (expired connections still have run history). */
export async function getConnectionRow(tenantKey: string): Promise<ConnectionRow | null> {
  const rows = await query<ConnectionRow>(
    `SELECT id, status, company_name FROM conta_azul_connections WHERE tenant_key = $1 LIMIT 1`,
    [tenantKey]
  )
  return rows[0] ?? null
}

export async function loadStoredMeta(connectionId: string, tipo: Tipo): Promise<Map<string, StoredMeta>> {
  const rows = await query<{ id: string; ca: string | null; det: string | null; has_payload: boolean; deleted: boolean }>(
    `SELECT id,
            to_char(ca_data_alteracao, ${TS_FMT}) AS ca,
            to_char(detail_alteracao, ${TS_FMT}) AS det,
            payload IS NOT NULL AS has_payload,
            deleted_at IS NOT NULL AS deleted
     FROM conta_azul_parcelas
     WHERE connection_id = $1 AND tipo = $2`,
    [connectionId, tipo]
  )
  return new Map(rows.map((r) => [r.id, { ca_data_alteracao: r.ca, detail_alteracao: r.det, has_payload: r.has_payload, deleted: r.deleted }]))
}

export async function upsertBusca(connectionId: string, rows: BuscaRow[]): Promise<void> {
  for (const batch of chunks(rows)) {
    await query(
      `INSERT INTO conta_azul_parcelas (
         id, connection_id, tipo, status_busca, descricao, data_vencimento, data_competencia,
         valor_total, valor_pago, nao_pago, pessoa_id, pessoa_nome, ca_data_alteracao,
         busca_payload, busca_synced_at, deleted_at
       )
       SELECT r.id, $1::uuid, r.tipo, r.status_busca, r.descricao, r.data_vencimento, r.data_competencia,
              r.valor_total, r.valor_pago, r.nao_pago, r.pessoa_id, r.pessoa_nome, r.ca_data_alteracao,
              COALESCE(r.busca_payload, '{}'::jsonb), NOW(), NULL
       FROM jsonb_to_recordset($2::jsonb) AS r(
         id text, tipo text, status_busca text, descricao text, data_vencimento date, data_competencia date,
         valor_total numeric, valor_pago numeric, nao_pago numeric, pessoa_id text, pessoa_nome text,
         ca_data_alteracao timestamp, busca_payload jsonb
       )
       ON CONFLICT (id) DO UPDATE SET
         tipo = EXCLUDED.tipo,
         status_busca = EXCLUDED.status_busca,
         descricao = EXCLUDED.descricao,
         data_vencimento = EXCLUDED.data_vencimento,
         data_competencia = COALESCE(conta_azul_parcelas.data_competencia, EXCLUDED.data_competencia),
         valor_total = EXCLUDED.valor_total,
         valor_pago = EXCLUDED.valor_pago,
         nao_pago = EXCLUDED.nao_pago,
         pessoa_id = EXCLUDED.pessoa_id,
         pessoa_nome = EXCLUDED.pessoa_nome,
         ca_data_alteracao = EXCLUDED.ca_data_alteracao,
         busca_payload = EXCLUDED.busca_payload,
         busca_synced_at = NOW(),
         deleted_at = NULL`,
      [connectionId, JSON.stringify(batch)]
    )
  }
}

/** Soft-deletes parcelas that vanished from Conta Azul and drops derived rows that no longer have a live parcela. */
export async function markDeleted(ids: string[]): Promise<void> {
  if (!ids.length) return
  await withTransaction(async (c) => {
    await c.query(`UPDATE conta_azul_parcelas SET deleted_at = NOW() WHERE id = ANY($1::text[]) AND deleted_at IS NULL`, [ids])
    await c.query(`DELETE FROM conta_azul_baixas WHERE parcela_id = ANY($1::text[])`, [ids])
    await c.query(
      `DELETE FROM conta_azul_rateio r
       WHERE NOT EXISTS (
         SELECT 1 FROM conta_azul_parcelas p WHERE p.evento_id = r.evento_id AND p.deleted_at IS NULL
       )`
    )
  })
}

/** Parcelas whose detail is missing or older than the latest search result; open and recent first. */
export async function pendingDetailIds(connectionId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM conta_azul_parcelas
     WHERE connection_id = $1
       AND deleted_at IS NULL
       AND (payload IS NULL OR detail_alteracao IS DISTINCT FROM ca_data_alteracao)
     ORDER BY (nao_pago > 0) DESC, data_vencimento DESC NULLS LAST`,
    [connectionId]
  )
  return rows.map((r) => r.id)
}

/**
 * Saves every parcela detail of one evento in a single transaction:
 * payload, baixas (replaced) and the evento rateio (replaced, stored once).
 * detail_alteracao copies the search timestamp the detail was fetched for, so
 * the next sweep only refetches parcelas that changed again.
 */
export async function saveEventoDetails(connectionId: string, details: unknown[]): Promise<string[]> {
  if (!details.length) return []
  const saved: string[] = []
  await withTransaction(async (c) => {
    for (const detail of details) {
      const d = parcelaFromDetail(detail)
      if (!d.tipo) continue
      await c.query(
        `INSERT INTO conta_azul_parcelas (
           id, connection_id, tipo, evento_id, status, descricao, data_vencimento, data_competencia,
           data_pagamento_previsto, valor_total, valor_pago, nao_pago, perda, conta_financeira_id, origem,
           conciliado, payload, detail_alteracao, detail_synced_at
         ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::timestamp, NOW())
         ON CONFLICT (id) DO UPDATE SET
           evento_id = EXCLUDED.evento_id,
           status = EXCLUDED.status,
           descricao = COALESCE(conta_azul_parcelas.descricao, EXCLUDED.descricao),
           data_vencimento = COALESCE(EXCLUDED.data_vencimento, conta_azul_parcelas.data_vencimento),
           data_competencia = COALESCE(EXCLUDED.data_competencia, conta_azul_parcelas.data_competencia),
           data_pagamento_previsto = EXCLUDED.data_pagamento_previsto,
           perda = EXCLUDED.perda,
           conta_financeira_id = EXCLUDED.conta_financeira_id,
           origem = EXCLUDED.origem,
           conciliado = EXCLUDED.conciliado,
           payload = EXCLUDED.payload,
           detail_alteracao = COALESCE(conta_azul_parcelas.ca_data_alteracao, EXCLUDED.detail_alteracao),
           detail_synced_at = NOW()`,
        [
          d.id, connectionId, d.tipo, d.evento_id, d.status, d.descricao, d.data_vencimento, d.data_competencia,
          d.data_pagamento_previsto, d.valor_pago + d.nao_pago, d.valor_pago, d.nao_pago, d.perda,
          d.conta_financeira_id, d.origem, d.conciliado, JSON.stringify(detail), d.detail_alteracao,
        ]
      )
      await c.query(`DELETE FROM conta_azul_baixas WHERE parcela_id = $1`, [d.id])
      const baixas = baixasFromDetail(detail)
      if (baixas.length) {
        await c.query(
          `INSERT INTO conta_azul_baixas (
             id, parcela_id, evento_id, tipo, data_pagamento, valor_bruto, juros, multa, desconto, taxa,
             valor_liquido, conta_financeira_id, metodo_pagamento, origem
           )
           SELECT b.id, b.parcela_id, b.evento_id, COALESCE(b.tipo, $2), b.data_pagamento, b.valor_bruto, b.juros, b.multa,
                  b.desconto, b.taxa, b.valor_liquido, b.conta_financeira_id, b.metodo_pagamento, b.origem
           FROM jsonb_to_recordset($1::jsonb) AS b(
             id text, parcela_id text, evento_id text, tipo text, data_pagamento date, valor_bruto numeric,
             juros numeric, multa numeric, desconto numeric, taxa numeric, valor_liquido numeric,
             conta_financeira_id text, metodo_pagamento text, origem text
           )
           ON CONFLICT (id) DO UPDATE SET
             parcela_id = EXCLUDED.parcela_id, evento_id = EXCLUDED.evento_id, tipo = EXCLUDED.tipo,
             data_pagamento = EXCLUDED.data_pagamento, valor_bruto = EXCLUDED.valor_bruto, juros = EXCLUDED.juros,
             multa = EXCLUDED.multa, desconto = EXCLUDED.desconto, taxa = EXCLUDED.taxa,
             valor_liquido = EXCLUDED.valor_liquido, conta_financeira_id = EXCLUDED.conta_financeira_id,
             metodo_pagamento = EXCLUDED.metodo_pagamento, origem = EXCLUDED.origem`,
          [JSON.stringify(baixas), d.tipo]
        )
      }
      saved.push(d.id)
    }

    const rateio = rateioFromEvento(details)
    const eventoId = rateio[0]?.evento_id ?? parcelaFromDetail(details[0]).evento_id
    if (eventoId) {
      await c.query(`DELETE FROM conta_azul_rateio WHERE evento_id = $1`, [eventoId])
      if (rateio.length) {
        await c.query(
          `INSERT INTO conta_azul_rateio (
             evento_id, linha, connection_id, tipo, categoria_id, categoria_nome, centro_custo_id, valor,
             data_competencia, origem
           )
           SELECT r.evento_id, r.linha, $2::uuid, r.tipo, r.categoria_id, r.categoria_nome, r.centro_custo_id, r.valor,
                  r.data_competencia, r.origem
           FROM jsonb_to_recordset($1::jsonb) AS r(
             evento_id text, linha int, tipo text, categoria_id text, categoria_nome text, centro_custo_id text,
             valor numeric, data_competencia date, origem text
           )`,
          [JSON.stringify(rateio), connectionId]
        )
      }
    }
  })
  return saved
}

export async function upsertCategorias(rows: CategoriaRow[]): Promise<void> {
  for (const batch of chunks(rows)) {
    await query(
      `INSERT INTO conta_azul_categorias (id, nome, tipo, categoria_pai, entrada_dre, considera_custo_dre, synced_at)
       SELECT r.id, r.nome, r.tipo, r.categoria_pai, r.entrada_dre, r.considera_custo_dre, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, nome text, tipo text, categoria_pai text, entrada_dre text, considera_custo_dre boolean)
       ON CONFLICT (id) DO UPDATE SET
         nome = EXCLUDED.nome, tipo = EXCLUDED.tipo, categoria_pai = EXCLUDED.categoria_pai,
         entrada_dre = EXCLUDED.entrada_dre, considera_custo_dre = EXCLUDED.considera_custo_dre, synced_at = NOW()`,
      [JSON.stringify(batch)]
    )
  }
}

/** The DRE layout is small and authoritative in Conta Azul, so it is replaced wholesale. */
export async function replaceDre(lines: DreLinha[], pairs: { dre_linha_id: string; categoria_id: string }[]): Promise<void> {
  if (!lines.length) return
  await withTransaction(async (c) => {
    await c.query(`DELETE FROM conta_azul_dre_categorias`)
    await c.query(`DELETE FROM conta_azul_dre_linhas`)
    await c.query(
      `INSERT INTO conta_azul_dre_linhas (id, parent_id, codigo, descricao, posicao, nivel, ordem, totalizador, synced_at)
       SELECT r.id, r.parent_id, r.codigo, r.descricao, r.posicao, r.nivel, r.ordem, r.totalizador, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, parent_id text, codigo text, descricao text, posicao int, nivel int, ordem int, totalizador boolean)`,
      [JSON.stringify(lines)]
    )
    if (pairs.length) {
      await c.query(
        `INSERT INTO conta_azul_dre_categorias (dre_linha_id, categoria_id)
         SELECT DISTINCT r.dre_linha_id, r.categoria_id
         FROM jsonb_to_recordset($1::jsonb) AS r(dre_linha_id text, categoria_id text)`,
        [JSON.stringify(pairs)]
      )
    }
  })
}

export async function upsertCentrosCusto(rows: CentroCustoRow[]): Promise<void> {
  if (!rows.length) return
  await query(
    `INSERT INTO conta_azul_centros_custo (id, codigo, nome, ativo, synced_at)
     SELECT r.id, r.codigo, r.nome, r.ativo, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, codigo text, nome text, ativo boolean)
     ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, synced_at = NOW()`,
    [JSON.stringify(rows)]
  )
}

export async function upsertContasFinanceiras(rows: ContaFinanceiraRow[]): Promise<void> {
  if (!rows.length) return
  await query(
    `INSERT INTO conta_azul_contas_financeiras (id, nome, banco, codigo_banco, tipo, ativo, conta_padrao, agencia, numero, synced_at)
     SELECT r.id, r.nome, r.banco, r.codigo_banco, r.tipo, r.ativo, r.conta_padrao, r.agencia, r.numero, NOW()
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, nome text, banco text, codigo_banco int, tipo text, ativo boolean, conta_padrao boolean, agencia text, numero text)
     ON CONFLICT (id) DO UPDATE SET
       nome = EXCLUDED.nome, banco = EXCLUDED.banco, codigo_banco = EXCLUDED.codigo_banco, tipo = EXCLUDED.tipo,
       ativo = EXCLUDED.ativo, conta_padrao = EXCLUDED.conta_padrao, agencia = EXCLUDED.agencia,
       numero = EXCLUDED.numero, synced_at = NOW()`,
    [JSON.stringify(rows)]
  )
}

export async function upsertPessoas(rows: PessoaRow[]): Promise<void> {
  for (const batch of chunks(rows)) {
    await query(
      `INSERT INTO conta_azul_pessoas (id, nome, documento, documento_digits, tipo_pessoa, perfis, ativo, synced_at)
       SELECT r.id, r.nome, r.documento, r.documento_digits, r.tipo_pessoa,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(r.perfis)), '{}'), r.ativo, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, nome text, documento text, documento_digits text, tipo_pessoa text, perfis jsonb, ativo boolean)
       ON CONFLICT (id) DO UPDATE SET
         nome = EXCLUDED.nome, documento = EXCLUDED.documento, documento_digits = EXCLUDED.documento_digits,
         tipo_pessoa = COALESCE(EXCLUDED.tipo_pessoa, conta_azul_pessoas.tipo_pessoa),
         perfis = ARRAY(SELECT DISTINCT unnest(conta_azul_pessoas.perfis || EXCLUDED.perfis)),
         ativo = EXCLUDED.ativo, synced_at = NOW()`,
      [JSON.stringify(batch)]
    )
  }
}

export async function activeContaIds(): Promise<string[]> {
  const rows = await query<{ id: string }>(`SELECT id FROM conta_azul_contas_financeiras WHERE ativo ORDER BY nome`)
  return rows.map((r) => r.id)
}

export async function upsertSaldo(contaId: string, dataSP: string, saldo: number): Promise<void> {
  await query(
    `INSERT INTO conta_azul_saldos_diarios (conta_financeira_id, data, saldo, captured_at)
     VALUES ($1, $2::date, $3, NOW())
     ON CONFLICT (conta_financeira_id, data) DO UPDATE SET saldo = EXCLUDED.saldo, captured_at = NOW()`,
    [contaId, dataSP, saldo]
  )
}

export type MirrorSums = { tipo: Tipo; itens: number; pago: number; aberto: number }

/** Sums compared against the API's own `totais` (pago and aberto) after a sweep, using the API's rules. */
export async function mirrorSums(connectionId: string): Promise<MirrorSums[]> {
  const rows = await query<{ tipo: Tipo; itens: string; pago: string; aberto: string }>(
    `SELECT tipo, COUNT(*)::text AS itens,
            -- Conta Azul's totais.pago counts settled titles at their original value
            -- (interest and fines excluded) and partial ones by the amount paid.
            COALESCE(SUM(CASE WHEN status_busca = 'RECEBIDO' THEN valor_total WHEN nao_pago > 0 THEN valor_pago ELSE 0 END), 0)::text AS pago,
            COALESCE(SUM(nao_pago), 0)::text AS aberto
     FROM conta_azul_parcelas
     WHERE connection_id = $1 AND deleted_at IS NULL
     GROUP BY tipo`,
    [connectionId]
  )
  return rows.map((r) => ({ tipo: r.tipo, itens: Number(r.itens), pago: Number(r.pago), aberto: Number(r.aberto) }))
}

/** Eventos whose stored rateio does not add up to the sum of their live parcelas (informational). */
export async function rateioMismatchCount(connectionId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    `WITH r AS (
       SELECT evento_id, SUM(valor) AS v FROM conta_azul_rateio WHERE connection_id = $1 GROUP BY evento_id
     ), p AS (
       SELECT evento_id, SUM(valor_total) AS v FROM conta_azul_parcelas
       WHERE connection_id = $1 AND deleted_at IS NULL AND evento_id IS NOT NULL
       GROUP BY evento_id
     )
     SELECT COUNT(*)::text AS n FROM p JOIN r USING (evento_id) WHERE ABS(p.v - r.v) > 0.05`,
    [connectionId]
  )
  return Number(rows[0]?.n ?? 0)
}
