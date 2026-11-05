import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { canReadOperacao, getApiSession } from '@/lib/dal'
import { ensureOperacaoTables } from '@/lib/operacao-tables'
import { getOperacaoEtapa, getOperacaoPainel, type OperacaoPainel } from '@/lib/operacao'

export const dynamic = 'force-dynamic'

interface OperacaoRow {
  cnpj: string
  nome_proponente: string | null
  uf: string | null
  municipio: string | null
  situacao_tgov: string | null
  total_convenios: number
  total_valor_global: string | null
  total_desembolsado: string | null
  valor_venda: string | null
  tipo_servico: string | null
  commercial_status: string | null
  vendedor_nome: string | null
  data_fim_vigencia: string | null
  dia_limite_prest_contas: string | null
  checklist_total: number
  checklist_done: number
  documentos_total: number
  documentos_done: number
  last_synced: string | null
}

const ALLOWED_PANELS: OperacaoPainel[] = ['execucao', 'prestacao_contas']

export async function GET(request: NextRequest) {
  const session = await getApiSession()
  if (!session || !canReadOperacao(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await ensureOperacaoTables()
    const params = request.nextUrl.searchParams
    const requestedPanel = params.get('panel') as OperacaoPainel | null
    const panel = requestedPanel && ALLOWED_PANELS.includes(requestedPanel) ? requestedPanel : 'execucao'
    const search = params.get('search')?.trim() ?? ''
    const stage = params.get('stage')?.trim() ?? ''
    const conditions: string[] = [
      panel === 'prestacao_contas'
        ? `pe.situacao ILIKE '%Prestação de Contas%'`
        : `pe.situacao NOT ILIKE '%Prestação de Contas%' AND COALESCE(pe.situacao, '') <> ''`,
    ]
    const values: unknown[] = []

    if (session.role === 'vendedor') {
      values.push(session.userId)
      conditions.push(`EXISTS (
        SELECT 1 FROM vendedor_projetos vp_scope
        WHERE REGEXP_REPLACE(vp_scope.cnpj, '[^0-9]', '', 'g') = pe.cnpj
          AND vp_scope.vendedor_id = $${values.length}
      )`)
    }
    if (search) {
      values.push(`%${search}%`)
      const p = values.length
      conditions.push(`(pe.nome_proponente ILIKE $${p} OR pe.cnpj ILIKE $${p} OR pe.nr_convenio ILIKE $${p})`)
    }

    const result = await query<OperacaoRow>(`
      WITH source_rows AS (
        SELECT pe.*
        FROM projetos_execucao pe
        WHERE ${conditions.join(' AND ')}
      ),
      commercial AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'))
          REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g') AS cnpj,
          vp.status_contato_execucao AS commercial_status,
          vp.tipo_servico,
          vp.valor_venda,
          u.nome AS vendedor_nome
        FROM vendedor_projetos vp
        LEFT JOIN users u ON u.id = vp.vendedor_id
        ORDER BY REGEXP_REPLACE(vp.cnpj, '[^0-9]', '', 'g'), vp.updated_at DESC NULLS LAST
      ),
      grouped AS (
        SELECT
          sr.cnpj,
          MAX(sr.nome_proponente) AS nome_proponente,
          MAX(sr.uf) AS uf,
          MAX(sr.municipio) AS municipio,
          (ARRAY_AGG(sr.situacao ORDER BY sr.synced_at DESC NULLS LAST))[1] AS situacao_tgov,
          COUNT(*)::int AS total_convenios,
          SUM(sr.valor_global)::text AS total_valor_global,
          SUM(sr.valor_desembolsado)::text AS total_desembolsado,
          MIN(sr.data_fim_vigencia)::text AS data_fim_vigencia,
          MIN(sr.dia_limite_prest_contas)::text AS dia_limite_prest_contas,
          MAX(sr.synced_at)::text AS last_synced,
          c.commercial_status,
          c.tipo_servico,
          c.valor_venda::text,
          c.vendedor_nome,
          COALESCE(SUM(oc.checklist_total), 0)::int AS checklist_total,
          COALESCE(SUM(oc.checklist_done), 0)::int AS checklist_done,
          COALESCE(SUM(od.documentos_total), 0)::int AS documentos_total,
          COALESCE(SUM(od.documentos_done), 0)::int AS documentos_done
        FROM source_rows sr
        LEFT JOIN commercial c ON c.cnpj = sr.cnpj
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS checklist_total,
            COUNT(*) FILTER (WHERE status IN ('concluido', 'nao_aplicavel'))::int AS checklist_done
          FROM operacao_checklists x WHERE x.cnpj = sr.cnpj AND x.nr_convenio = sr.nr_convenio
        ) oc ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS documentos_total,
            COUNT(*) FILTER (WHERE status IN ('aprovado', 'nao_aplicavel'))::int AS documentos_done
          FROM operacao_documentos x WHERE x.cnpj = sr.cnpj AND x.nr_convenio = sr.nr_convenio
        ) od ON TRUE
        GROUP BY sr.cnpj, c.commercial_status, c.tipo_servico, c.valor_venda, c.vendedor_nome
      )
      SELECT * FROM grouped
      ORDER BY
        CASE WHEN checklist_done < checklist_total OR documentos_done < documentos_total THEN 0 ELSE 1 END,
        COALESCE(data_fim_vigencia, dia_limite_prest_contas) ASC NULLS LAST,
        nome_proponente ASC
    `, values)

    const mapped = result
      .map(row => ({
        ...row,
        etapa: getOperacaoEtapa(row.situacao_tgov),
        painel: getOperacaoPainel(row.situacao_tgov),
        commercial_status: row.commercial_status ?? 'Não Contatado',
      }))
      .filter(row => !stage || row.etapa === stage)

    const syncRows = await query<{ ran_at: string | null }>(
      `SELECT ran_at::text FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`
    )

    return NextResponse.json({
      panel,
      rows: mapped,
      last_synced: syncRows[0]?.ran_at ?? null,
      source: 'TransfereGov sync → projetos_execucao',
    })
  } catch (error) {
    console.error('[api/operacao] Query error:', error)
    return NextResponse.json({ error: 'Não foi possível carregar a operação' }, { status: 500 })
  }
}
