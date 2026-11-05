import assert from 'node:assert/strict'
import test from 'node:test'

import { computeDre, dreCategoryPairs, flattenDreTree, resolveDreLine, type DreNode } from './dre'

// Trimmed copy of the real /v1/financeiro/categorias-dre tree.
const tree: DreNode[] = [
  { id: 'g01', codigo: '01', descricao: 'Receitas Operacionais', posicao: 1, indica_totalizador: false, categorias_financeiras: [], subitens: [
    { id: 'l011', codigo: '01.1', descricao: 'Receita de Vendas', posicao: 1, indica_totalizador: false, subitens: [], categorias_financeiras: [{ id: 'cat-rec' }] },
  ] },
  { id: 't-rb', codigo: null, descricao: 'Receita Bruta de Vendas', posicao: 2, indica_totalizador: true, subitens: [], categorias_financeiras: [] },
  { id: 'g02', codigo: '02', descricao: 'Deduções da Receita Bruta', posicao: 3, indica_totalizador: false, categorias_financeiras: [], subitens: [
    { id: 'l021', codigo: '02.1', descricao: 'Impostos Sobre Vendas', posicao: 1, indica_totalizador: false, subitens: [], categorias_financeiras: [{ id: 'cat-iss' }] },
    { id: 'l022', codigo: '02.2', descricao: 'Comissões Sobre Vendas', posicao: 2, indica_totalizador: false, subitens: [], categorias_financeiras: [{ id: 'cat-com' }] },
  ] },
  { id: 't-rl', codigo: null, descricao: 'Receita Líquida de Vendas', posicao: 4, indica_totalizador: true, subitens: [], categorias_financeiras: [] },
  { id: 'g04', codigo: '04', descricao: 'Despesas Operacionais', posicao: 5, indica_totalizador: false, categorias_financeiras: [], subitens: [
    { id: 'l042', codigo: '04.2', descricao: 'Despesas Administrativas', posicao: 1, indica_totalizador: false, subitens: [], categorias_financeiras: [{ id: 'cat-adm' }] },
  ] },
  { id: 't-lo', codigo: null, descricao: 'Lucro / Prejuízo Operacional', posicao: 6, indica_totalizador: true, subitens: [], categorias_financeiras: [] },
]

test('flattenDreTree keeps tree order, depth and totalizer flags', () => {
  const lines = flattenDreTree([...tree].reverse())
  assert.deepEqual(lines.map((l) => l.id), ['g01', 'l011', 't-rb', 'g02', 'l021', 'l022', 't-rl', 'g04', 'l042', 't-lo'])
  assert.equal(lines.find((l) => l.id === 'l021')!.parent_id, 'g02')
  assert.equal(lines.find((l) => l.id === 'l021')!.nivel, 1)
  assert.equal(lines.find((l) => l.id === 't-rb')!.totalizador, true)
  assert.deepEqual(lines.map((l) => l.ordem), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('dreCategoryPairs lists every category under its line', () => {
  assert.deepEqual(dreCategoryPairs(tree), [
    { dre_linha_id: 'l011', categoria_id: 'cat-rec' },
    { dre_linha_id: 'l021', categoria_id: 'cat-iss' },
    { dre_linha_id: 'l022', categoria_id: 'cat-com' },
    { dre_linha_id: 'l042', categoria_id: 'cat-adm' },
  ])
})

test('resolveDreLine uses the category, then its nearest mapped ancestor, else null', () => {
  const parents = new Map<string, string | null>([
    ['cat-adm', null],
    ['cat-aluguel', 'cat-adm'],
    ['cat-aluguel-sala', 'cat-aluguel'],
    ['cat-orfa', null],
    ['loop-a', 'loop-b'],
    ['loop-b', 'loop-a'],
  ])
  const map = new Map([['cat-adm', 'l042']])
  assert.equal(resolveDreLine('cat-adm', parents, map), 'l042')
  assert.equal(resolveDreLine('cat-aluguel-sala', parents, map), 'l042')
  assert.equal(resolveDreLine('cat-orfa', parents, map), null)
  assert.equal(resolveDreLine('loop-a', parents, map), null)
  assert.equal(resolveDreLine('unknown', parents, map), null)
})

test('computeDre sums children into groups and totalizers are cumulative', () => {
  const lines = flattenDreTree(tree)
  const own = new Map<string, number[]>([
    ['l011', [1000, 500]],
    ['l021', [-80, -40]],
    ['l022', [-50, -25]],
    ['l042', [-600, -700]],
  ])
  const rows = computeDre(lines, own, 2)
  const v = (id: string) => rows.find((r) => r.id === id)!.values
  assert.deepEqual(v('g01'), [1000, 500])
  assert.deepEqual(v('t-rb'), [1000, 500])
  assert.deepEqual(v('g02'), [-130, -65])
  assert.deepEqual(v('t-rl'), [870, 435])
  assert.deepEqual(v('t-lo'), [270, -265])
  assert.equal(rows.length, lines.length)
})

test('computeDre fills missing lines with zeros', () => {
  const rows = computeDre(flattenDreTree(tree), new Map(), 3)
  assert.ok(rows.every((r) => r.values.length === 3 && r.values.every((x) => x === 0)))
})
