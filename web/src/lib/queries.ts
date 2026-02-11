import { query } from './db'
import type { Stats, Lead, EstadoData, ValueDistribution, InstrumentSummary, Emenda, Proposta, Ministerio, Programa, Instrument } from './types'

export async function getStats(): Promise<Stats> {
  const rows = await query(`
    SELECT
      COUNT(*) as total_leads,
      COUNT(CASE WHEN p.is_existing_client = true THEN 1 END) as existing_clients,
      COUNT(CASE WHEN p.is_existing_client = false THEN 1 END) as new_leads,
      SUM(COALESCE(agg.total_emendas, 0)) as total_emendas,
      SUM(COALESCE(agg.valor_total_emendas, 0)) as total_valor_emendas,
      AVG(COALESCE(agg.total_propostas, 0)) as avg_propostas,
      COUNT(CASE WHEN COALESCE(agg.total_propostas, 0) <= 3 THEN 1 END) as high_value_leads,
      SUM(COALESCE(agg.total_convenios, 0)) as total_convenios,
      SUM(COALESCE(agg.valor_total_desembolsos, 0)) as total_valor_desembolsos
    FROM proponentes p
    LEFT JOIN (
      SELECT
        prop.proponente_cnpj,
        COUNT(DISTINCT prop.id) as total_propostas,
        COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
        COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
        COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
        COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
      FROM propostas prop
      LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
      GROUP BY prop.proponente_cnpj
    ) agg ON p.cnpj = agg.proponente_cnpj
    WHERE p.natureza_juridica NOT ILIKE '%Administra%'
  `)
  const r = rows[0] as Record<string, unknown>
  return {
    total_leads: Number(r.total_leads) || 0,
    existing_clients: Number(r.existing_clients) || 0,
    new_leads: Number(r.new_leads) || 0,
    total_emendas: Number(r.total_emendas) || 0,
    total_valor_emendas: Number(r.total_valor_emendas) || 0,
    avg_propostas: Number(r.avg_propostas) || 0,
    high_value_leads: Number(r.high_value_leads) || 0,
    total_convenios: Number(r.total_convenios) || 0,
    total_valor_desembolsos: Number(r.total_valor_desembolsos) || 0,
  }
}

export async function getTopLeads(limit = 10): Promise<Lead[]> {
  return query<Lead>(
    `SELECT
      p.id, p.cnpj, p.nome, p.natureza_juridica, p.estado, p.municipio,
      COALESCE(agg.total_propostas, 0)::int as total_propostas,
      COALESCE(agg.total_emendas, 0)::int as total_emendas,
      COALESCE(agg.valor_total_emendas, 0) as valor_total_emendas,
      COALESCE(agg.total_convenios, 0)::int as total_convenios,
      COALESCE(agg.valor_total_desembolsos, 0) as valor_total_desembolsos,
      p.email, p.telefone, p.is_osc, p.is_existing_client
    FROM proponentes p
    LEFT JOIN (
      SELECT
        prop.proponente_cnpj,
        COUNT(DISTINCT prop.id) as total_propostas,
        COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
        COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
        COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
        COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
      FROM propostas prop
      LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
      GROUP BY prop.proponente_cnpj
    ) agg ON p.cnpj = agg.proponente_cnpj
    WHERE p.natureza_juridica NOT ILIKE '%Administra%'
    ORDER BY p.is_existing_client DESC, COALESCE(agg.total_propostas, 0) ASC, COALESCE(agg.total_emendas, 0) DESC
    LIMIT $1`,
    [limit]
  )
}

export async function getEstadosChart(): Promise<EstadoData[]> {
  return query<EstadoData>(`
    SELECT
      p.estado,
      COUNT(*)::int as total_proponentes,
      SUM(COALESCE(agg.total_emendas, 0))::int as total_emendas,
      SUM(COALESCE(agg.valor_total_emendas, 0)) as total_valor_emendas
    FROM proponentes p
    LEFT JOIN (
      SELECT prop.proponente_cnpj,
        COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
        COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas
      FROM propostas prop
      LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      GROUP BY prop.proponente_cnpj
    ) agg ON p.cnpj = agg.proponente_cnpj
    WHERE p.natureza_juridica NOT ILIKE '%Administra%' AND p.estado IS NOT NULL
    GROUP BY p.estado ORDER BY total_proponentes DESC
  `)
}

export async function getDistribution(): Promise<ValueDistribution[]> {
  return query<ValueDistribution>(`
    SELECT faixa, quantidade::int FROM (
      SELECT
        CASE
          WHEN COALESCE(agg.total_propostas, 0) = 1 THEN '1 proposta (Alto Valor)'
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN '2-3 propostas (Bom Valor)'
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN '4-5 propostas (Medio)'
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN '6-10 propostas (Baixo)'
          ELSE '10+ propostas (Muito Baixo)'
        END as faixa,
        CASE
          WHEN COALESCE(agg.total_propostas, 0) = 1 THEN 1
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 2 AND 3 THEN 2
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 4 AND 5 THEN 3
          WHEN COALESCE(agg.total_propostas, 0) BETWEEN 6 AND 10 THEN 4
          ELSE 5
        END as sort_order,
        COUNT(*)::int as quantidade
      FROM proponentes p
      LEFT JOIN (
        SELECT proponente_cnpj, COUNT(*) as total_propostas FROM propostas GROUP BY proponente_cnpj
      ) agg ON p.cnpj = agg.proponente_cnpj
      WHERE p.natureza_juridica NOT ILIKE '%Administra%'
      GROUP BY faixa, sort_order
    ) sub ORDER BY sort_order
  `)
}

export async function getLeadOverview(cnpj: string): Promise<Lead | null> {
  const rows = await query<Lead>(
    `SELECT
      p.id, p.cnpj, p.nome, p.email, p.telefone,
      p.endereco, p.bairro, p.municipio, p.estado, p.cep,
      p.natureza_juridica,
      COALESCE(agg.total_propostas, 0)::int as total_propostas,
      COALESCE(agg.total_emendas, 0)::int as total_emendas,
      COALESCE(agg.valor_total_emendas, 0) as valor_total_emendas,
      COALESCE(agg.total_convenios, 0)::int as total_convenios,
      COALESCE(agg.valor_total_desembolsos, 0) as valor_total_desembolsos,
      p.is_existing_client, p.is_osc
    FROM proponentes p
    LEFT JOIN (
      SELECT prop.proponente_cnpj,
        COUNT(DISTINCT prop.id) as total_propostas,
        COUNT(DISTINCT e.transfer_gov_id) as total_emendas,
        COALESCE(SUM(DISTINCT e.valor), 0) as valor_total_emendas,
        COUNT(DISTINCT c.transfer_gov_id) as total_convenios,
        COALESCE(SUM(c.valor_desembolsado), 0) as valor_total_desembolsos
      FROM propostas prop
      LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
      LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
      LEFT JOIN convenios c ON prop.transfer_gov_id = c.proposta_id
      GROUP BY prop.proponente_cnpj
    ) agg ON p.cnpj = agg.proponente_cnpj
    WHERE p.cnpj = $1`,
    [cnpj]
  )
  return rows[0] || null
}

export async function getLeadInstrumentSummary(cnpj: string): Promise<InstrumentSummary> {
  const rows = await query(
    `SELECT
      COUNT(DISTINCT c.transfer_gov_id)::int as total_instrumentos,
      COALESCE(SUM(c.valor_global), 0) as total_valor_global,
      COALESCE(SUM(c.valor_empenhado), 0) as total_empenhado,
      COALESCE(SUM(c.valor_desembolsado), 0) as total_liberado,
      COALESCE(SUM(c.saldo_conta), 0) as total_saldo_conta,
      COUNT(DISTINCT CASE WHEN c.instrumento_ativo = 'SIM' THEN c.transfer_gov_id END)::int as instrumentos_ativos
    FROM convenios c
    INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
    WHERE prop.proponente_cnpj = $1`,
    [cnpj]
  )
  const r = rows[0] as Record<string, unknown>
  return {
    total_instrumentos: Number(r.total_instrumentos) || 0,
    total_valor_global: Number(r.total_valor_global) || 0,
    total_empenhado: Number(r.total_empenhado) || 0,
    total_liberado: Number(r.total_liberado) || 0,
    total_saldo_conta: Number(r.total_saldo_conta) || 0,
    instrumentos_ativos: Number(r.instrumentos_ativos) || 0,
  }
}

export async function getLeadEmendas(cnpj: string): Promise<Emenda[]> {
  return query<Emenda>(
    `SELECT DISTINCT e.numero as numero_emenda, e.autor as parlamentar, e.valor as valor_emenda, e.tipo as tipo_emenda, a.nome as apoiador_nome, a.orgao as ministerio
    FROM propostas prop
    INNER JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
    INNER JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
    LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
    LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
    WHERE prop.proponente_cnpj = $1 ORDER BY e.valor DESC LIMIT 100`,
    [cnpj]
  )
}

export async function getLeadPropostas(cnpj: string): Promise<Proposta[]> {
  return query<Proposta>(
    `SELECT p.transfer_gov_id, p.titulo, p.situacao, p.valor_global, p.valor_repasse, p.data_publicacao, prog.nome as programa_nome
    FROM propostas p LEFT JOIN programas prog ON p.programa_id = prog.transfer_gov_id
    WHERE p.proponente_cnpj = $1 ORDER BY p.data_publicacao DESC LIMIT 100`,
    [cnpj]
  )
}

export async function getLeadMinisterios(cnpj: string): Promise<Ministerio[]> {
  return query<Ministerio>(
    `SELECT a.orgao, COUNT(DISTINCT prop.transfer_gov_id)::int as count
    FROM propostas prop
    LEFT JOIN proposta_apoiadores pa ON prop.transfer_gov_id = pa.proposta_transfer_gov_id
    LEFT JOIN apoiadores a ON pa.apoiador_transfer_gov_id = a.transfer_gov_id
    WHERE prop.proponente_cnpj = $1 AND a.orgao IS NOT NULL AND a.orgao != '' AND a.orgao != 'nan'
    GROUP BY a.orgao ORDER BY count DESC`,
    [cnpj]
  )
}

export async function getLeadProgramas(cnpj: string): Promise<Programa[]> {
  return query<Programa>(
    `SELECT prog.nome as programa_nome, prog.transfer_gov_id as programa_id, COUNT(DISTINCT p.transfer_gov_id)::int as count
    FROM propostas p INNER JOIN programas prog ON p.programa_id = prog.transfer_gov_id
    WHERE p.proponente_cnpj = $1 GROUP BY prog.nome, prog.transfer_gov_id ORDER BY count DESC`,
    [cnpj]
  )
}

export async function getLeadInstruments(cnpj: string): Promise<Instrument[]> {
  return query<Instrument>(
    `SELECT c.transfer_gov_id as nr_instrumento, prop.modalidade, c.situacao, c.instrumento_ativo,
      CASE WHEN pe.emenda_transfer_gov_id IS NOT NULL THEN 'SIM' ELSE 'NAO' END as tem_emenda,
      e.autor as parlamentar, c.valor_global, e.valor as valor_emenda, c.valor_empenhado,
      c.valor_desembolsado as valor_liberado, c.saldo_conta, c.valor_repasse, c.valor_contrapartida,
      c.valor_global_original, c.rendimento_aplicacao, c.ingresso_contrapartida,
      c.data_inicio_vigencia, c.data_fim_vigencia
    FROM convenios c
    INNER JOIN propostas prop ON c.proposta_id = prop.transfer_gov_id
    LEFT JOIN proposta_emendas pe ON prop.transfer_gov_id = pe.proposta_transfer_gov_id
    LEFT JOIN emendas e ON pe.emenda_transfer_gov_id = e.transfer_gov_id
    WHERE prop.proponente_cnpj = $1 ORDER BY c.valor_global DESC NULLS LAST`,
    [cnpj]
  )
}
