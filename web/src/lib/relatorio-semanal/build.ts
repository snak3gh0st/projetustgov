import 'server-only'
import { query } from '@/lib/db'
import { CRM_STATUS_FUNNEL_ORDER } from '@/lib/crm-catalog'
import { addDaysISO, monthKey, todaySP } from '../conta-azul/finance/dates'
import { parcelStatus } from '../financeiro/assemble'
import { getClientesCrm, getOverview } from '../financeiro/queries'
import type { TituloRow } from '../financeiro/types'
import { moneyCompact } from '@/components/financeiro/format'
import { carregar } from './store'
import { diasDa, empresaDaConta, montarAlertas, negocioDoCentro, semanaDe, semanaSeguinte } from './regras'
import type { AtividadeVendedor, Movimento, Relatorio, Semana, Venda } from './types'

/** Mesmos filtros do BI Financeiro: título em aberto e lançamento ainda vivo no Conta Azul. */
const OPEN = `p.deleted_at IS NULL AND p.nao_pago > 0 AND COALESCE(p.status_busca, '') NOT IN ('PERDIDO', 'RENEGOCIADO', 'CANCELADO')`
const LIVE_EVENTO = `EXISTS (
  SELECT 1 FROM conta_azul_parcelas lp
  WHERE lp.evento_id = r.evento_id AND lp.deleted_at IS NULL AND COALESCE(lp.status, '') <> 'CANCELADO'
)`

/** Limites da semana em São Paulo, para colunas timestamptz. */
const SP_RANGE = `>= ($1::date)::timestamp AT TIME ZONE 'America/Sao_Paulo' AND e.created_at < ($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`

const AVANCOS = ['Em Atendimento', 'Reunião Agendada', 'Proposta Enviada', 'Aprovação', 'Em Aprovação']
const PERDAS = ['Sem Interesse', 'Churn']
const r2 = (n: number) => Math.round(n * 100) / 100

export async function montarRelatorio(hoje: string = todaySP(), semana: Semana = semanaDe(hoje)): Promise<Relatorio> {
  const proxima = semanaSeguinte(semana)
  const anterior = await carregar(addDaysISO(semana.ate, -7))

  const [overview, sync, contas, baixas, agenda, negocios, clientes, comercial] = await Promise.all([
    getOverview(),
    query<{ fim: string | null }>(
      `SELECT MAX(finished_at)::text AS fim FROM conta_azul_sync_runs WHERE status IN ('completed', 'partial')`
    ),
    query<{ nome: string; atual: number | null; inicio: number | null }>(
      `SELECT c.nome,
              (SELECT s.saldo FROM conta_azul_saldos_diarios s WHERE s.conta_financeira_id = c.id AND s.data <= $1::date ORDER BY s.data DESC LIMIT 1)::float8 AS atual,
              (SELECT s.saldo FROM conta_azul_saldos_diarios s WHERE s.conta_financeira_id = c.id AND s.data <= $2::date ORDER BY s.data DESC LIMIT 1)::float8 AS inicio
       FROM conta_azul_contas_financeiras c WHERE c.ativo`,
      [hoje, addDaysISO(semana.de, -1)]
    ),
    query<{ tipo: string; data: string; pessoa: string | null; descricao: string | null; valor: number }>(
      `SELECT b.tipo, b.data_pagamento::text AS data, p.pessoa_nome AS pessoa, p.descricao, b.valor_liquido::float8 AS valor
       FROM conta_azul_baixas b
       JOIN conta_azul_parcelas p ON p.id = b.parcela_id AND p.deleted_at IS NULL
       WHERE b.data_pagamento BETWEEN $1::date AND $2::date AND COALESCE(p.origem, '') <> 'TRANSFERENCIA'
       ORDER BY b.valor_liquido DESC`,
      [semana.de, semana.ate]
    ),
    query<Omit<TituloRow, 'status'>>(
      `SELECT p.id, p.tipo, p.data_vencimento::text AS data_vencimento, p.pessoa_nome, p.descricao,
              p.busca_payload->'categorias'->0->>'nome' AS categoria,
              p.valor_total::float8 AS valor_total, p.valor_pago::float8 AS valor_pago, p.nao_pago::float8 AS nao_pago
       FROM conta_azul_parcelas p
       WHERE ${OPEN} AND p.data_vencimento BETWEEN $1::date AND $2::date
       ORDER BY p.data_vencimento, p.nao_pago DESC`,
      [proxima.de, proxima.ate]
    ),
    query<{ centro: string | null; v: number }>(
      `SELECT cc.nome AS centro, SUM(r.valor)::float8 AS v
       FROM conta_azul_rateio r
       LEFT JOIN conta_azul_centros_custo cc ON cc.id = r.centro_custo_id
       WHERE r.tipo = 'RECEITA' AND r.data_competencia BETWEEN $1::date AND $2::date
         AND COALESCE(r.origem, '') <> 'TRANSFERENCIA' AND ${LIVE_EVENTO}
       GROUP BY 1`,
      [`${monthKey(hoje)}-01`, hoje]
    ),
    getClientesCrm(),
    montarComercial(semana, hoje),
  ])

  // caixa por empresa
  const empresas = new Map<string, { saldo: number; variacao: number }>()
  let total: number | null = null
  let inicioSemana: number | null = null
  let contasNegativas = 0
  for (const c of contas) {
    if (c.atual == null) continue
    const atual = Number(c.atual)
    const inicio = c.inicio == null ? atual : Number(c.inicio)
    total = (total ?? 0) + atual
    inicioSemana = (inicioSemana ?? 0) + inicio
    if (atual < 0) contasNegativas += 1
    const e = empresas.get(empresaDaConta(c.nome)) ?? { saldo: 0, variacao: 0 }
    e.saldo += atual
    e.variacao += atual - inicio
    empresas.set(empresaDaConta(c.nome), e)
  }

  const mov = (tipo: string): Movimento[] =>
    baixas.filter((b) => b.tipo === tipo).slice(0, 8).map((b) => ({ data: b.data, pessoa: b.pessoa ?? 'Sem nome', descricao: b.descricao, valor: Number(b.valor) }))
  const soma = (tipo: string) => r2(baixas.filter((b) => b.tipo === tipo).reduce((a, b) => a + Number(b.valor), 0))

  const titulos: TituloRow[] = agenda.map((t) => ({ ...t, status: parcelStatus(t, hoje) }))
  const dias = diasDa(proxima).map((data) => {
    const doDia = titulos.filter((t) => t.data_vencimento === data)
    const total = (tipo: string) => r2(doDia.filter((t) => t.tipo === tipo).reduce((a, t) => a + t.nao_pago, 0))
    return { data, receber: total('RECEITA'), pagar: total('DESPESA') }
  })

  const porNegocio = new Map<string, number>()
  for (const n of negocios) porNegocio.set(negocioDoCentro(n.centro), (porNegocio.get(negocioDoCentro(n.centro)) ?? 0) + Number(n.v))

  const ate30 = addDaysISO(hoje, 30)
  const projecaoMin = overview.projecao
    .filter((p) => p.date <= ate30)
    .reduce<{ data: string; saldo: number } | null>((min, p) => (!min || p.balance < min.saldo ? { data: p.date, saldo: r2(p.balance) } : min), null)

  // Só clientes vindos do CRM (com venda fechada), cruzados com o que foi faturado no Conta Azul.
  const crm = clientes.rows.filter((c) => c.status !== 'semcrm')
  const somaCrm = (k: 'vendido' | 'faturado' | 'recebido' | 'aberto' | 'vencido') => r2(crm.reduce((a, c) => a + Number(c[k]), 0))

  const funilAnterior = new Map((anterior?.dados.comercial.funil ?? []).map((f) => [f.status, f.leads]))

  const semAlertas: Omit<Relatorio, 'alertas'> = {
    versao: 1,
    semana,
    proxima,
    geradoEm: new Date().toISOString(),
    financeiroAte: sync[0]?.fim ?? null,
    financeiro: {
      saldo: { total: total == null ? null : r2(total), inicioSemana: inicioSemana == null ? null : r2(inicioSemana), contasNegativas },
      porEmpresa: Array.from(empresas, ([empresa, v]) => ({ empresa, saldo: r2(v.saldo), variacao: r2(v.variacao) })).sort((a, b) => b.saldo - a.saldo),
      semana: { recebido: soma('RECEITA'), pago: soma('DESPESA'), recebimentos: mov('RECEITA'), pagamentos: mov('DESPESA') },
      agenda: { dias, titulos },
      atrasados: {
        receber: {
          total: overview.atrasados.total,
          count: overview.atrasados.count,
          top: overview.atrasados.top.map((t) => ({ nome: t.pessoa_nome ?? 'Sem nome', valor: t.nao_pago, desde: t.data_vencimento })),
        },
        pagar: overview.pagar.atrasados,
      },
      resultado: {
        mtd: { atual: overview.resultado.mtd.atual, anterior: overview.resultado.mtd.mesmoPontoAnterior },
        mes: overview.resultado.atual,
        mesAnterior: overview.resultado.anterior,
      },
      porNegocio: Array.from(porNegocio, ([negocio, receita]) => ({ negocio, receita: r2(receita) })).filter((n) => Math.abs(n.receita) >= 0.01).sort((a, b) => b.receita - a.receita),
      posicao: overview.posicao,
      projecaoMin,
    },
    comercial: {
      ...comercial,
      funil: comercial.funil.map((f) => ({ ...f, anterior: anterior ? funilAnterior.get(f.status) ?? 0 : null })),
      carteira: { clientes: crm.length, vendido: somaCrm('vendido'), faturado: somaCrm('faturado'), recebido: somaCrm('recebido'), aberto: somaCrm('aberto'), vencido: somaCrm('vencido') },
    },
  }
  return { ...semAlertas, alertas: montarAlertas(semAlertas, moneyCompact) }
}

async function montarComercial(semana: Semana, hoje: string): Promise<Omit<Relatorio['comercial'], 'carteira' | 'funil'> & { funil: { status: string; leads: number }[] }> {
  const inicioSerie = addDaysISO(semana.de, -7 * 7)
  const [vendas, eventos, vendedores, funil, movimento, distribuidos] = await Promise.all([
    query<{ data: string; cliente: string; municipio: string | null; uf: string | null; servico: string | null; valor: number; vendedor: string | null; vendedor_id: string | null }>(
      `SELECT (v.fechamento_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS data, v.nome AS cliente, v.municipio, v.uf,
              NULLIF(v.tipo_servico, '') AS servico, COALESCE(v.valor_venda, 0)::float8 AS valor, u.nome AS vendedor, v.vendedor_id
       FROM vendedor_projetos v LEFT JOIN users u ON u.id = v.vendedor_id
       WHERE (v.fechamento_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
       ORDER BY v.fechamento_at`,
      [inicioSerie < `${monthKey(hoje)}-01` ? inicioSerie : `${monthKey(hoje)}-01`, semana.ate]
    ),
    query<{ user_id: string; trabalhados: number; avancos: number; perdas: number }>(
      `SELECT e.user_id::text AS user_id,
              COUNT(DISTINCT e.lead_id)::int AS trabalhados,
              COUNT(*) FILTER (WHERE e.valor_novo = ANY($3::text[]))::int AS avancos,
              COUNT(*) FILTER (WHERE e.valor_novo = ANY($4::text[]))::int AS perdas
       FROM lead_events e
       WHERE e.origem = 'manual' AND e.tipo IN ('status', 'status_execucao') AND e.user_id IS NOT NULL
         AND e.created_at ${SP_RANGE}
       GROUP BY 1`,
      [semana.de, semana.ate, AVANCOS, PERDAS]
    ),
    query<{ id: string; nome: string }>(
      `SELECT id::text AS id, nome FROM users WHERE active AND role IN ('vendedor', 'coordenador') ORDER BY nome`
    ),
    query<{ status: string; leads: number }>(
      `SELECT COALESCE(NULLIF(status_contato, ''), 'Não Contatado') AS status, COUNT(*)::int AS leads FROM vendedor_projetos GROUP BY 1`
    ),
    query<{ etapa: string; leads: number }>(
      `SELECT e.valor_novo AS etapa, COUNT(DISTINCT e.lead_id)::int AS leads
       FROM lead_events e
       WHERE e.tipo IN ('status', 'status_execucao') AND e.valor_novo IS NOT NULL AND e.created_at ${SP_RANGE}
       GROUP BY 1 ORDER BY 2 DESC`,
      [semana.de, semana.ate]
    ),
    query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM lead_events e WHERE e.tipo = 'atribuicao' AND e.origem = 'distribuicao' AND e.created_at ${SP_RANGE}`,
      [semana.de, semana.ate]
    ),
  ])

  const naSemana = vendas.filter((v) => v.data >= semana.de)
  const itens: Venda[] = naSemana.map((v) => ({
    data: v.data,
    cliente: v.cliente,
    local: [v.municipio, v.uf].filter(Boolean).join('/') || null,
    servico: v.servico ?? 'Não informado',
    valor: Number(v.valor),
    vendedor: v.vendedor ?? 'Sem vendedor',
  }))
  const doMes = vendas.filter((v) => v.data >= `${monthKey(hoje)}-01`)

  const serie = Array.from({ length: 8 }, (_, i) => {
    const de = addDaysISO(semana.de, -7 * (7 - i))
    const ate = addDaysISO(de, 6)
    const s = vendas.filter((v) => v.data >= de && v.data <= ate)
    return { semana: de, count: s.length, total: r2(s.reduce((a, v) => a + Number(v.valor), 0)) }
  })

  const porUsuario = new Map(eventos.map((e) => [e.user_id, e]))
  const time: AtividadeVendedor[] = vendedores.map((u) => {
    const e = porUsuario.get(u.id)
    const vs = naSemana.filter((v) => v.vendedor_id === u.id)
    return {
      nome: u.nome,
      trabalhados: e?.trabalhados ?? 0,
      avancos: e?.avancos ?? 0,
      perdas: e?.perdas ?? 0,
      vendas: vs.length,
      valorVendido: r2(vs.reduce((a, v) => a + Number(v.valor), 0)),
    }
  })

  const ordem = new Map<string, number>(CRM_STATUS_FUNNEL_ORDER.map((s, i) => [s, i]))
  const funilOrdenado = funil.sort((a, b) => (ordem.get(a.status) ?? 99) - (ordem.get(b.status) ?? 99) || b.leads - a.leads)

  return {
    vendas: {
      itens,
      total: r2(itens.reduce((a, v) => a + v.valor, 0)),
      mes: { count: doMes.length, total: r2(doMes.reduce((a, v) => a + Number(v.valor), 0)) },
      serie,
    },
    time,
    funil: funilOrdenado,
    movimento,
    distribuidos: distribuidos[0]?.n ?? 0,
  }
}
