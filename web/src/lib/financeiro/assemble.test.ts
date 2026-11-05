import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDre,
  classifyCrm,
  closedMonths,
  dailyProjection,
  entradaDreLine,
  nonPaymentRate,
  parcelStatus,
  weeklyProjection,
} from './assemble'
import { flattenDreTree, type DreNode } from '../conta-azul/finance/dre'

test('closedMonths lists finished months before today in Sao Paulo', () => {
  assert.deepEqual(closedMonths('q', '2026-10-08'), ['2026-07', '2026-08', '2026-09'])
  assert.deepEqual(closedMonths('ytd', '2026-10-08').slice(0, 2), ['2026-01', '2026-02'])
  assert.equal(closedMonths('ytd', '2026-10-08').length, 9)
  assert.deepEqual(closedMonths('12', '2026-01-15'), [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  ])
  // In January the year has no closed month yet: "ano" shows the previous full year
  assert.equal(closedMonths('ytd', '2026-01-15').length, 12)
  assert.equal(closedMonths('ytd', '2026-01-15')[0], '2025-01')
})

test('dailyProjection starts at the current balance and only adds future flows', () => {
  const pts = dailyProjection(1000, [
    { date: '2026-10-07', net: 999 }, // overdue: ignored
    { date: '2026-10-09', net: 200 },
    { date: '2026-10-09', net: -50 },
    { date: '2026-10-11', net: -400 },
  ], '2026-10-08', 4)
  assert.deepEqual(pts.map((p) => [p.date, p.balance]), [
    ['2026-10-08', 1000], ['2026-10-09', 1150], ['2026-10-10', 1150], ['2026-10-11', 750], ['2026-10-12', 750],
  ])
})

test('weeklyProjection rolls weeks and marks the lowest closing balance', () => {
  const w = weeklyProjection(500, [
    { date: '2026-10-10', net: 100 },
    { date: '2026-10-16', net: -700 },
    { date: '2026-10-23', net: 300 },
  ], '2026-10-08', 3)
  assert.deepEqual(w.weeks.map((x) => [x.from, x.inflow, x.outflow, x.end]), [
    ['2026-10-09', 100, 0, 600],
    ['2026-10-16', 0, 700, -100],
    ['2026-10-23', 300, 0, 200],
  ])
  assert.equal(w.minIndex, 1)
})

test('classifyCrm covers the four reconciliation outcomes', () => {
  assert.equal(classifyCrm({ vendido: 100000, faturado: 100000 }), 'ok')
  assert.equal(classifyCrm({ vendido: 100000, faturado: 91000 }), 'ok')
  assert.equal(classifyCrm({ vendido: 100000, faturado: 0 }), 'semfat')
  assert.equal(classifyCrm({ vendido: 100000, faturado: 60000 }), 'diverg')
  assert.equal(classifyCrm({ vendido: 0, faturado: 5000 }), 'semcrm')
})

test('nonPaymentRate is unpaid over billed for past due titles', () => {
  assert.equal(nonPaymentRate([{ valor_total: 1000, nao_pago: 50 }, { valor_total: 1000, nao_pago: 0 }]), 0.025)
  assert.equal(nonPaymentRate([]), 0)
})

test('parcelStatus distinguishes paid, late, partial, due today and upcoming', () => {
  const today = '2026-10-08'
  assert.equal(parcelStatus({ data_vencimento: '2026-10-01', nao_pago: 0, valor_pago: 10 }, today).key, 'pago')
  const late = parcelStatus({ data_vencimento: '2026-10-01', nao_pago: 10, valor_pago: 0 }, today)
  assert.equal(late.key, 'vencido')
  assert.equal(late.days, 7)
  assert.equal(late.label, '7 dias em atraso')
  assert.equal(parcelStatus({ data_vencimento: '2026-10-07', nao_pago: 5, valor_pago: 5 }, today).label, 'Parcial, 1 dia em atraso')
  assert.equal(parcelStatus({ data_vencimento: today, nao_pago: 5, valor_pago: 0 }, today).key, 'hoje')
  assert.equal(parcelStatus({ data_vencimento: '2026-11-01', nao_pago: 5, valor_pago: 0 }, today).key, 'aberto')
})

const tree: DreNode[] = [
  { id: 'g01', codigo: '01', descricao: 'Receitas', posicao: 1, subitens: [
    { id: 'l011', codigo: '01.1', descricao: 'Vendas', posicao: 1, categorias_financeiras: [{ id: 'rec' }] },
  ] },
  { id: 'tot', codigo: null, descricao: 'Receita Bruta', posicao: 2, indica_totalizador: true },
  { id: 'g04', codigo: '04', descricao: 'Despesas', posicao: 3, subitens: [
    { id: 'l042', codigo: '04.2', descricao: 'Administrativas', posicao: 1, categorias_financeiras: [{ id: 'adm' }] },
  ] },
]

test('entradaDreLine maps the Conta Azul enum (including its DESPESSAS typo) to tree codes', () => {
  const lines = flattenDreTree(tree)
  assert.equal(entradaDreLine('DESPESAS_ADMINISTRATIVAS', lines), 'l042')
  assert.equal(entradaDreLine('RECEITA_VENDA_PRODUTOS_SERVICOS', lines), 'l011')
  assert.equal(entradaDreLine('DESPESSAS_FINANCEIRAS', lines), null) // 05.2 not in this trimmed tree
  assert.equal(entradaDreLine(null, lines), null)
})

test('buildDre resolves categories by ancestry and keeps unmapped ones aside', () => {
  const lines = flattenDreTree(tree)
  const pairs = [{ dre_linha_id: 'l011', categoria_id: 'rec' }, { dre_linha_id: 'l042', categoria_id: 'adm' }]
  const cats = [
    { id: 'rec', nome: 'Receitas de serviços', categoria_pai: null, entrada_dre: null },
    { id: 'adm', nome: 'Administrativas', categoria_pai: null, entrada_dre: null },
    { id: 'aluguel', nome: 'Aluguel', categoria_pai: 'adm', entrada_dre: null },
    { id: 'solta', nome: 'Sem pai', categoria_pai: null, entrada_dre: null },
    { id: 'tarifa', nome: 'Tarifas', categoria_pai: null, entrada_dre: 'DESPESAS_ADMINISTRATIVAS' },
  ]
  const values = [
    { categoria_id: 'rec', idx: 0, valor: 1000 },
    { categoria_id: 'aluguel', idx: 0, valor: -300 },
    { categoria_id: 'aluguel', idx: 1, valor: -310 },
    { categoria_id: 'solta', idx: 1, valor: -20 },
    { categoria_id: null, idx: 1, valor: -5 },
    { categoria_id: 'tarifa', idx: 0, valor: -7 },
  ]
  const dre = buildDre(lines, pairs, cats, values, 2)
  const row = (id: string) => dre.rows.find((r) => r.id === id)!
  // Tarifas is not in the tree but its entrada_dre points at Despesas Administrativas (04.2)
  assert.deepEqual(row('l042').values, [-307, -310])
  assert.deepEqual(row('l042').categorias.map((c) => [c.nome, c.values]), [['Aluguel', [-300, -310]], ['Tarifas', [-7, 0]]])
  assert.deepEqual(row('tot').values, [1000, 0])
  assert.deepEqual(dre.unclassified.values, [0, -25])
  assert.deepEqual(dre.unclassified.categorias.map((c) => c.nome).sort(), ['Sem categoria', 'Sem pai'])
})
