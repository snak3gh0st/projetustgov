import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession, canReadTgov } from '@/lib/dal'
import { ensureTgovTables } from '@/lib/tgov-tables'
import { searchLivePropostas } from '@/lib/tgov-live-search'

export const dynamic = 'force-dynamic'

/**
 * Search SICONV data by CNPJ — returns all proposals (propostas) and
 * execution projects (projetos_execucao) for a given CNPJ.
 * Independent of the Projetus whitelist.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || !canReadTgov(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureTgovTables()

    const cnpjParam = (request.nextUrl.searchParams.get('cnpj') ?? '').replace(/\D/g, '')
    const nrPropostaParam = request.nextUrl.searchParams.get('nr_proposta') ?? ''

    if (!cnpjParam && !nrPropostaParam) {
      return NextResponse.json({ error: 'Informe CNPJ ou NR Proposta' }, { status: 400 })
    }
    if (cnpjParam && cnpjParam.length < 11) {
      return NextResponse.json({ error: 'CNPJ inválido' }, { status: 400 })
    }

    // Build WHERE clause based on search type
    const isCnpjSearch = !!cnpjParam
    const propostaWhere = isCnpjSearch ? 'proponente_cnpj = $1' : 'nr_proposta = $1'
    const execWhere = isCnpjSearch ? 'cnpj = $1' : 'nr_proposta = $1'
    const searchValue = isCnpjSearch ? cnpjParam : nrPropostaParam.replace(/^0+/, '')

    const [propostas, execucao] = await Promise.all([
      query<{
        transfer_gov_id: string
        nr_proposta: string | null
        titulo: string | null
        proponente: string | null
        proponente_cnpj: string
        situacao: string | null
        valor_global: string | null
        valor_repasse: string | null
        estado: string | null
        municipio: string | null
        data_publicacao: string | null
      }>(
        `WITH all_propostas AS (
          SELECT transfer_gov_id, nr_proposta, titulo, proponente, proponente_cnpj,
                 situacao, valor_global, valor_repasse, estado, municipio, data_publicacao
          FROM propostas
          UNION ALL
          SELECT transfer_gov_id, nr_proposta, titulo, proponente, proponente_cnpj,
                 situacao, valor_global, valor_repasse, estado, municipio, data_publicacao
          FROM tgov_propostas tp
          WHERE NOT EXISTS (SELECT 1 FROM propostas crm WHERE crm.transfer_gov_id = tp.transfer_gov_id)
        )
        SELECT
          transfer_gov_id,
          nr_proposta,
          titulo,
          proponente,
          COALESCE(proponente_cnpj, '') AS proponente_cnpj,
          COALESCE(situacao, 'Sem Situação') AS situacao,
          valor_global::text,
          valor_repasse::text,
          estado,
          municipio,
          data_publicacao::text
        FROM all_propostas
        WHERE ${propostaWhere}
        ORDER BY data_publicacao DESC NULLS LAST`,
        [searchValue]
      ),

      query<{
        nr_convenio: string
        id_proposta: string | null
        nr_proposta: string | null
        nome_proponente: string | null
        cnpj: string
        situacao: string | null
        valor_global: string | null
        valor_repasse: string | null
        valor_desembolsado: string | null
        saldo_conta: string | null
        pct_execucao: string | null
        uf: string | null
        municipio: string | null
        data_assinatura: string | null
        data_inicio_vigencia: string | null
        data_fim_vigencia: string | null
      }>(
        `WITH all_exec AS (
          SELECT nr_convenio, id_proposta, nr_proposta, nome_proponente, cnpj, situacao,
                 valor_global, valor_repasse, valor_desembolsado, saldo_conta, pct_execucao,
                 uf, municipio, data_assinatura, data_inicio_vigencia, data_fim_vigencia
          FROM projetos_execucao
          UNION ALL
          SELECT nr_convenio, id_proposta, nr_proposta, nome_proponente, cnpj, situacao,
                 valor_global, valor_repasse, valor_desembolsado, saldo_conta, pct_execucao,
                 uf, municipio, data_assinatura, data_inicio_vigencia, data_fim_vigencia
          FROM tgov_projetos_execucao tpe
          WHERE NOT EXISTS (SELECT 1 FROM projetos_execucao crm WHERE crm.nr_convenio = tpe.nr_convenio)
        )
        SELECT
          nr_convenio,
          id_proposta,
          nr_proposta,
          COALESCE(nome_proponente, '') AS nome_proponente,
          cnpj,
          COALESCE(situacao, 'Sem Situação') AS situacao,
          valor_global::text,
          valor_repasse::text,
          valor_desembolsado::text,
          saldo_conta::text,
          pct_execucao::text,
          uf,
          municipio,
          data_assinatura::text,
          data_inicio_vigencia::text,
          data_fim_vigencia::text
        FROM all_exec
        WHERE ${execWhere}
        ORDER BY valor_global DESC NULLS LAST`,
        [searchValue]
      ),
    ])

    const livePropostas = (
      !isCnpjSearch || propostas.length === 0
    ) ? await searchLivePropostas({
      cnpj: isCnpjSearch ? cnpjParam : undefined,
      nrProposta: isCnpjSearch ? undefined : nrPropostaParam,
      limit: isCnpjSearch ? 50 : 1,
    }) : []

    const responsePropostas = propostas.map((r) => ({
      transferGovId: r.transfer_gov_id,
      numeroProposta: r.nr_proposta || r.transfer_gov_id,
      titulo: r.titulo,
      proponente: r.proponente ?? '',
      situacao: r.situacao ?? 'Sem Situação',
      valorGlobal: r.valor_global ? parseFloat(r.valor_global) : null,
      valorRepasse: r.valor_repasse ? parseFloat(r.valor_repasse) : null,
      uf: r.estado,
      municipio: r.municipio,
      data: r.data_publicacao ? String(r.data_publicacao) : null,
    }))

    const seenProposalKeys = new Set(
      responsePropostas.map((proposal) => `${proposal.transferGovId}::${proposal.numeroProposta.replace(/^0+/, '')}`)
    )

    for (const live of livePropostas) {
      const key = `${live.transferGovId}::${live.nrProposta.replace(/^0+/, '')}`
      if (seenProposalKeys.has(key)) continue
      responsePropostas.push({
        transferGovId: live.transferGovId,
        numeroProposta: live.nrProposta || live.transferGovId,
        titulo: live.titulo,
        proponente: live.proponente ?? '',
        situacao: live.situacao ?? 'Sem Situação',
        valorGlobal: live.valorGlobal,
        valorRepasse: live.valorRepasse,
        uf: live.uf,
        municipio: live.municipio,
        data: live.dataPublicacao,
      })
      seenProposalKeys.add(key)
    }

    const cnpj = cnpjParam || propostas[0]?.proponente_cnpj || livePropostas[0]?.proponenteCnpj || execucao[0]?.cnpj || ''
    const proponente = propostas[0]?.proponente || livePropostas[0]?.proponente || execucao[0]?.nome_proponente || null

    // Check if this CNPJ is already a Projetus client (existing_clients or vendedor_projetos)
    let isProjetusClient = false
    if (cnpj) {
      const clientCheck = await query<{ found: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM existing_clients WHERE cnpj = $1
          UNION ALL
          SELECT 1 FROM vendedor_projetos WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') = $1
        ) AS found`,
        [cnpj]
      )
      isProjetusClient = clientCheck[0]?.found ?? false
    }

    return NextResponse.json({
      cnpj,
      proponente,
      isProjetusClient,
      propostas: responsePropostas,
      execucao: execucao.map(r => ({
        nrConvenio: r.nr_convenio,
        idProposta: r.id_proposta,
        numeroProposta: r.nr_proposta || r.id_proposta || r.nr_convenio,
        proponente: r.nome_proponente ?? '',
        situacao: r.situacao ?? 'Sem Situação',
        valorGlobal: r.valor_global ? parseFloat(r.valor_global) : null,
        valorRepasse: r.valor_repasse ? parseFloat(r.valor_repasse) : null,
        valorDesembolsado: r.valor_desembolsado ? parseFloat(r.valor_desembolsado) : null,
        saldoConta: r.saldo_conta ? parseFloat(r.saldo_conta) : null,
        pctExecucao: r.pct_execucao ? parseFloat(r.pct_execucao) : null,
        uf: r.uf,
        municipio: r.municipio,
        data: r.data_assinatura ? String(r.data_assinatura) : null,
        dataFimVigencia: r.data_fim_vigencia ? String(r.data_fim_vigencia) : null,
      })),
    })
  } catch (error) {
    console.error('[api/tgov/busca-cnpj] Error:', error)
    return NextResponse.json({ error: 'Erro ao buscar CNPJ' }, { status: 500 })
  }
}
