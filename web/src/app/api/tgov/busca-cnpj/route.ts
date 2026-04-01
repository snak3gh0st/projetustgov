import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getApiSession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

/**
 * Search SICONV data by CNPJ — returns all proposals (propostas) and
 * execution projects (projetos_execucao) for a given CNPJ.
 * Independent of the Projetus whitelist.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession()
    if (!session || (session.role !== 'gestor' && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
        `SELECT
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
        FROM propostas
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
        `SELECT
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
        FROM projetos_execucao
        WHERE ${execWhere}
        ORDER BY valor_global DESC NULLS LAST`,
        [searchValue]
      ),
    ])

    const cnpj = cnpjParam || propostas[0]?.proponente_cnpj || execucao[0]?.cnpj || ''
    const proponente = propostas[0]?.proponente || execucao[0]?.nome_proponente || null

    return NextResponse.json({
      cnpj,
      proponente,
      propostas: propostas.map(r => ({
        numeroProposta: r.nr_proposta || r.transfer_gov_id,
        titulo: r.titulo,
        proponente: r.proponente ?? '',
        situacao: r.situacao ?? 'Sem Situação',
        valorGlobal: r.valor_global ? parseFloat(r.valor_global) : null,
        valorRepasse: r.valor_repasse ? parseFloat(r.valor_repasse) : null,
        uf: r.estado,
        municipio: r.municipio,
        data: r.data_publicacao ? String(r.data_publicacao) : null,
      })),
      execucao: execucao.map(r => ({
        nrConvenio: r.nr_convenio,
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
