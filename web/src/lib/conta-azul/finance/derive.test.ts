import assert from 'node:assert/strict'
import test from 'node:test'

import {
  apportionByRateio,
  baixasFromDetail,
  categoriaFromApi,
  centroCustoFromApi,
  cnpjDigits,
  contaFinanceiraFromApi,
  diffSweep,
  listItems,
  listTotal,
  normalizeTs,
  parcelaFromBusca,
  parcelaFromDetail,
  pessoaFromApi,
  rateioFromEvento,
  saldoFromApi,
  totalsFromBusca,
} from './derive'
import type { StoredMeta } from './types'

// Shapes copied from real Conta Azul API v2 responses (values anonymised).
const buscaItem = {
  id: 'p-1',
  status: 'ACQUITTED',
  total: 4801.88,
  descricao: 'Parcela 1/3 assessoria',
  data_vencimento: '2026-03-10',
  status_traduzido: 'RECEBIDO',
  nao_pago: 0,
  pago: 4801.88,
  data_criacao: '2026-02-01T10:00:00',
  data_alteracao: '2026-03-10T14:22:05.123',
  data_competencia: '2026-02-01',
  categorias: [{ id: 'cat-serv', nome: 'Receitas de serviços' }],
  centros_de_custo: [],
  cliente: { id: 'pes-1', nome: 'Prefeitura de Santa Aurora' },
  renegociacao: null,
}

function parcelDetail(id: string, indice: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: 'QUITADO',
    evento: {
      id: 'ev-1',
      data_competencia: '2026-02-01',
      condicao_pagamento: { quantidade_parcelas: 3, montante_fixo: false },
      referencia: { id: null, revisao: null, origem: 'LANCAMENTO_FINANCEIRO' },
      tipo: 'DESPESA',
      // Conta Azul repeats the FULL evento split inside every parcela.
      rateio: [
        {
          id_categoria: 'cat-proj',
          nome_categoria: 'Projetistas parceiros',
          valor: 14405.64,
          valor_bruto: 14405.64,
          rateio_centro_custo: [
            { id_centro_custo: 'cc-aprov', valor: 10000 },
            { id_centro_custo: 'cc-exec', valor: 3000 },
          ],
        },
      ],
    },
    indice,
    conciliado: true,
    valor_pago: 4801.88,
    perda: null,
    nao_pago: 0,
    data_vencimento: '2026-03-10',
    data_pagamento_previsto: '2026-03-10',
    descricao: 'Lote 18',
    conta_financeira: { id: 'cf-itau', banco: 'ITAU' },
    valor_composicao: { multa: 0, juros: 0, valor_bruto: 4801.88, desconto: 0, taxa: 0, valor_liquido: 4801.88 },
    baixas: [
      {
        id: `b-${id}`,
        data_pagamento: '2026-03-11',
        valor_composicao: { multa: 10, juros: 2.5, valor_bruto: 4801.88, desconto: 0, taxa: 1.2, valor_liquido: 4813.18 },
        conta_financeira: { id: 'cf-itau' },
        metodo_pagamento: 'PIX',
        origem: 'LANCAMENTO_FINANCEIRO',
        id_parcela: id,
      },
    ],
    data_alteracao: '2026-03-11T09:00:00',
    ...extra,
  }
}

test('listItems and listTotal accept both spellings used by the API', () => {
  assert.deepEqual(listItems({ itens: [1, 2], itens_totais: 2 }), [1, 2])
  assert.deepEqual(listItems({ items: [3], totalItems: 7 }), [3])
  assert.deepEqual(listItems([4, 5]), [4, 5])
  assert.deepEqual(listItems({}), [])
  assert.equal(listTotal({ itens_totais: 157 }), 157)
  assert.equal(listTotal({ total_itens: 9 }), 9)
  assert.equal(listTotal({ totalItems: 106 }), 106)
  assert.equal(listTotal({ itens: [] }), null)
})

test('normalizeTs drops milliseconds and pads plain dates', () => {
  assert.equal(normalizeTs('2026-03-10T14:22:05.123'), '2026-03-10T14:22:05')
  assert.equal(normalizeTs('2026-03-10 14:22:05'), '2026-03-10T14:22:05')
  assert.equal(normalizeTs('2026-03-10'), '2026-03-10T00:00:00')
  assert.equal(normalizeTs(''), null)
  assert.equal(normalizeTs(null), null)
})

test('parcelaFromBusca maps receivable and payable counterparts', () => {
  const r = parcelaFromBusca(buscaItem, 'RECEITA')
  assert.equal(r.id, 'p-1')
  assert.equal(r.tipo, 'RECEITA')
  assert.equal(r.status_busca, 'RECEBIDO')
  assert.equal(r.valor_total, 4801.88)
  assert.equal(r.pessoa_id, 'pes-1')
  assert.equal(r.ca_data_alteracao, '2026-03-10T14:22:05')

  const p = parcelaFromBusca({ ...buscaItem, cliente: undefined, fornecedor: { id: 'f-1', nome: 'Agência' } }, 'DESPESA')
  assert.equal(p.pessoa_id, 'f-1')
  assert.equal(p.pessoa_nome, 'Agência')
})

test('parcelaFromDetail reads evento id, origem and account', () => {
  const d = parcelaFromDetail(parcelDetail('p-1', 1))
  assert.equal(d.evento_id, 'ev-1')
  assert.equal(d.tipo, 'DESPESA')
  assert.equal(d.origem, 'LANCAMENTO_FINANCEIRO')
  assert.equal(d.conta_financeira_id, 'cf-itau')
  assert.equal(d.quantidade_parcelas, 3)
  assert.equal(d.detail_alteracao, '2026-03-11T09:00:00')
})

test('baixasFromDetail keeps payment composition', () => {
  const [b] = baixasFromDetail(parcelDetail('p-1', 1))
  assert.equal(b.id, 'b-p-1')
  assert.equal(b.parcela_id, 'p-1')
  assert.equal(b.evento_id, 'ev-1')
  assert.equal(b.data_pagamento, '2026-03-11')
  assert.equal(b.juros, 2.5)
  assert.equal(b.multa, 10)
  assert.equal(b.taxa, 1.2)
  assert.equal(b.valor_liquido, 4813.18)
  assert.equal(b.metodo_pagamento, 'PIX')
})

test('rateio is derived once per evento: 3 parcelas of 4.801,88 do not triple the 14.405,64', () => {
  const details = [parcelDetail('p-1', 1), parcelDetail('p-2', 2), parcelDetail('p-3', 3)]
  const rows = rateioFromEvento(details)
  const total = rows.reduce((a, r) => a + r.valor, 0)
  assert.equal(Math.round(total * 100) / 100, 14405.64)
  // cost-centre split plus the unassigned remainder (14405.64 - 13000)
  assert.deepEqual(
    rows.map((r) => [r.centro_custo_id, r.valor]),
    [['cc-aprov', 10000], ['cc-exec', 3000], [null, 1405.64]]
  )
  assert.ok(rows.every((r) => r.evento_id === 'ev-1' && r.tipo === 'DESPESA' && r.data_competencia === '2026-02-01'))
  assert.deepEqual(rows.map((r) => r.linha), [0, 1, 2])
})

test('rateio without cost centres yields one row per category', () => {
  const d = parcelDetail('p-9', 1, {
    evento: {
      id: 'ev-9',
      tipo: 'RECEITA',
      data_competencia: '2026-05-01',
      referencia: { origem: 'VENDA' },
      rateio: [
        { id_categoria: 'a', nome_categoria: 'A', valor: 100, rateio_centro_custo: [] },
        { id_categoria: 'b', nome_categoria: 'B', valor: 50.5 },
      ],
    },
  })
  const rows = rateioFromEvento([d])
  assert.deepEqual(rows.map((r) => [r.categoria_id, r.centro_custo_id, r.valor]), [['a', null, 100], ['b', null, 50.5]])
  assert.equal(rows[0].origem, 'VENDA')
})

test('apportionByRateio splits a payment by category share', () => {
  const parts = apportionByRateio(300, [
    { categoria_id: 'a', valor: 200 },
    { categoria_id: 'b', valor: 100 },
  ])
  assert.deepEqual(parts, [{ categoria_id: 'a', valor: 200 }, { categoria_id: 'b', valor: 100 }])
  // installment of 1/3 of the evento
  const third = apportionByRateio(4801.88, [{ categoria_id: 'x', valor: 14405.64 }])
  assert.deepEqual(third, [{ categoria_id: 'x', valor: 4801.88 }])
  assert.deepEqual(apportionByRateio(10, []), [])
})

test('cnpjDigits strips the mask and rejects empty values', () => {
  assert.equal(cnpjDigits('60.701.190/0001-04'), '60701190000104')
  assert.equal(cnpjDigits('60701190000104'), '60701190000104')
  assert.equal(cnpjDigits(' '), null)
  assert.equal(cnpjDigits(null), null)
})

function meta(m: Partial<StoredMeta>): StoredMeta {
  return { ca_data_alteracao: '2026-03-10T14:22:05', detail_alteracao: '2026-03-10T14:22:05', has_payload: true, deleted: false, ...m }
}

test('diffSweep flags new, changed, detail-less, revived and removed parcelas', () => {
  const stored = new Map<string, StoredMeta>([
    ['same', meta({})],
    ['changed', meta({ detail_alteracao: '2026-03-01T00:00:00' })],
    ['nopayload', meta({ has_payload: false })],
    ['revived', meta({ deleted: true })],
    ['gone', meta({})],
    ['already-gone', meta({ deleted: true })],
  ])
  const fetched = ['same', 'changed', 'nopayload', 'revived', 'new'].map((id) =>
    parcelaFromBusca({ ...buscaItem, id }, 'RECEITA')
  )
  const d = diffSweep(stored, fetched, { complete: true })
  assert.deepEqual(d.needDetail.sort(), ['changed', 'new', 'nopayload', 'revived'])
  assert.deepEqual(d.deleted, ['gone'])
  assert.equal(d.upserts.length, 5)
})

test('diffSweep never deletes when the sweep was incomplete', () => {
  const stored = new Map<string, StoredMeta>([['gone', meta({})]])
  const d = diffSweep(stored, [], { complete: false })
  assert.deepEqual(d.deleted, [])
})

test('dimension mappers read the real field names', () => {
  assert.deepEqual(
    categoriaFromApi({ id: 'c1', versao: 2, nome: 'Aluguel', categoria_pai: 'c0', tipo: 'DESPESA', entrada_dre: 'DESPESAS_ADMINISTRATIVAS', considera_custo_dre: false }),
    { id: 'c1', nome: 'Aluguel', tipo: 'DESPESA', categoria_pai: 'c0', entrada_dre: 'DESPESAS_ADMINISTRATIVAS', considera_custo_dre: false }
  )
  assert.equal(centroCustoFromApi({ id: 'cc', codigo: '01', nome: 'Aprovação', ativo: false }).ativo, false)
  const conta = contaFinanceiraFromApi({ id: 'cf', banco: 'ITAU', codigo_banco: 341, nome: 'Principal', ativo: true, tipo: 'CONTA_CORRENTE', conta_padrao: true, agencia: null, numero: null })
  assert.equal(conta.codigo_banco, 341)
  assert.equal(conta.conta_padrao, true)
  const pessoa = pessoaFromApi({ id: 'p', nome: 'X', documento: '60.701.190/0001-04', perfis: [{ tipo_perfil: 'Cliente' }], tipo_pessoa: 'Jurídica', ativo: true })
  assert.deepEqual(pessoa.perfis, ['Cliente'])
  assert.equal(pessoa.documento_digits, '60701190000104')
  assert.deepEqual(pessoaFromApi({ id: 'q', perfis: ['Fornecedor'] }).perfis, ['Fornecedor'])
  assert.deepEqual(
    totalsFromBusca({ totais: { pago: { valor: 4164502.23 }, vencido: { valor: 199773.36 }, aberto: { valor: 638559.68 }, todos: 4803061.91 } }),
    { pago: 4164502.23, aberto: 638559.68, vencido: 199773.36, todos: 4803061.91 }
  )
  assert.equal(saldoFromApi({ saldo_atual: -14470.5 }), -14470.5)
  assert.equal(saldoFromApi({}), null)
})
