import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { canReadOperacao, canWriteOperacao, getApiSession } from '@/lib/dal'
import { ensureOperacaoTables } from '@/lib/operacao-tables'
import { OPERACAO_CHECKLIST, OPERACAO_DOCUMENTOS, type OperacaoDocumentoStatus, type OperacaoItemStatus } from '@/lib/operacao'

export const dynamic = 'force-dynamic'

const CHECKLIST_STATUSES: OperacaoItemStatus[] = ['pendente', 'em_andamento', 'concluido', 'nao_aplicavel']
const DOCUMENT_STATUSES: OperacaoDocumentoStatus[] = ['pendente', 'em_analise', 'recebido', 'aprovado', 'rejeitado', 'nao_aplicavel']

function cleanCnpj(value: string): string { return value.replace(/\D/g, '') }

export async function GET(_request: NextRequest, context: { params: { cnpj: string } }) {
  const session = await getApiSession()
  if (!session || !canReadOperacao(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    await ensureOperacaoTables()
    const cnpj = cleanCnpj(decodeURIComponent(context.params.cnpj))
    const projects = await query<{
      nr_convenio: string; id_proposta: string | null; situacao: string | null; objeto: string | null
      valor_global: string | null; valor_desembolsado: string | null; saldo_conta: string | null
      data_inicio_vigencia: string | null; data_fim_vigencia: string | null; dia_limite_prest_contas: string | null
    }>(`SELECT nr_convenio, id_proposta, situacao, objeto, valor_global::text, valor_desembolsado::text,
        saldo_conta::text, data_inicio_vigencia::text, data_fim_vigencia::text,
        dia_limite_prest_contas::text FROM projetos_execucao WHERE cnpj = $1 ORDER BY data_fim_vigencia ASC NULLS LAST`, [cnpj])

    if (projects.length === 0) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

    const convenios = projects.map(project => project.nr_convenio)
    const [checklists, documentos, history, events, syncRows] = await Promise.all([
      query(`SELECT nr_convenio, item_key, item_label, status, note, updated_at::text FROM operacao_checklists WHERE cnpj = $1 ORDER BY nr_convenio, id`, [cnpj]),
      query(`SELECT nr_convenio, document_key, document_label, status, note, updated_at::text FROM operacao_documentos WHERE cnpj = $1 ORDER BY nr_convenio, id`, [cnpj]),
      query(`
        SELECT hs.convenio_id AS nr_convenio, hs.situacao, hs.data_historico::text, hs.dias_historico, 'TransfereGov' AS source
        FROM historico_situacao hs
        WHERE hs.convenio_id = ANY($1::text[])
        ORDER BY hs.data_historico DESC NULLS LAST LIMIT 80
      `, [convenios]),
      query(`SELECT nr_convenio, event_type, from_status, to_status, note, source, occurred_at::text FROM operacao_eventos WHERE cnpj = $1 ORDER BY occurred_at DESC LIMIT 40`, [cnpj]),
      query<{ ran_at: string | null }>(`SELECT ran_at::text FROM cron_sync_log WHERE source = 'sync-execucao' ORDER BY ran_at DESC LIMIT 1`),
    ])

    return NextResponse.json({ cnpj, projects, checklists, documentos, history, events, last_synced: syncRows[0]?.ran_at ?? null, source: 'TransfereGov sync → projetos_execucao', catalog: { checklist: OPERACAO_CHECKLIST, documentos: OPERACAO_DOCUMENTOS } })
  } catch (error) {
    console.error('[api/operacao/:cnpj] GET error:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o detalhe operacional' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: { cnpj: string } }) {
  const session = await getApiSession()
  if (!session || !canWriteOperacao(session.role)) return NextResponse.json({ error: 'Sem permissão para alterar a operação' }, { status: 403 })

  try {
    await ensureOperacaoTables()
    const cnpj = cleanCnpj(decodeURIComponent(context.params.cnpj))
    const body = await request.json() as { kind?: 'checklist' | 'documento'; nr_convenio?: string; item_key?: string; status?: string; note?: string | null }
    const kind = body.kind
    const nrConvenio = body.nr_convenio?.trim()
    const itemKey = body.item_key?.trim()
    if (!kind || !nrConvenio || !itemKey || !body.status) return NextResponse.json({ error: 'Informe item, convênio e status' }, { status: 400 })
    const allowed = kind === 'checklist' ? CHECKLIST_STATUSES : DOCUMENT_STATUSES
    if (!allowed.includes(body.status as never)) return NextResponse.json({ error: 'Status operacional inválido' }, { status: 400 })
    const sourceCheck = await query(`SELECT 1 FROM projetos_execucao WHERE cnpj = $1 AND nr_convenio = $2 LIMIT 1`, [cnpj, nrConvenio])
    if (sourceCheck.length === 0) return NextResponse.json({ error: 'Convênio não pertence à fonte sincronizada' }, { status: 400 })

    const table = kind === 'checklist' ? 'operacao_checklists' : 'operacao_documentos'
    const keyColumn = kind === 'checklist' ? 'item_key' : 'document_key'
    const labelColumn = kind === 'checklist' ? 'item_label' : 'document_label'
    const catalog = kind === 'checklist' ? OPERACAO_CHECKLIST : OPERACAO_DOCUMENTOS
    const catalogItem = catalog.find(item => item.key === itemKey)
    if (!catalogItem) return NextResponse.json({ error: 'Item operacional inválido' }, { status: 400 })

    const rows = await query<{ status: string; note: string | null }>(`
      INSERT INTO ${table} (cnpj, nr_convenio, ${keyColumn}, ${labelColumn}, status, note, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (cnpj, nr_convenio, ${keyColumn}) DO UPDATE SET
        status = EXCLUDED.status, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      RETURNING status, note
    `, [cnpj, nrConvenio, itemKey, catalogItem.label, body.status, body.note ?? null, session.userId])

    await query(`INSERT INTO operacao_eventos (cnpj, nr_convenio, event_type, to_status, note, actor_id) VALUES ($1, $2, $3, $4, $5, $6)`, [cnpj, nrConvenio, kind === 'checklist' ? 'checklist_updated' : 'document_updated', body.status, `${catalogItem.label}${body.note ? `: ${body.note}` : ''}`, session.userId])
    return NextResponse.json({ ok: true, kind, item_key: itemKey, status: rows[0]?.status, note: rows[0]?.note })
  } catch (error) {
    console.error('[api/operacao/:cnpj] PATCH error:', error)
    return NextResponse.json({ error: 'Não foi possível salvar a atualização' }, { status: 500 })
  }
}
