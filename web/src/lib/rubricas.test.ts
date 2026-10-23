import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCurrencyInput } from './format'
import { MAX_RUBRICAS, parseRubricas, totalLinha, totalRubricas } from './rubricas'

test('total da linha é meses × valor unitário', () => {
  assert.equal(totalLinha({ meses: 12, valorUnitario: 3500 }), 42000)
  assert.equal(totalLinha({ meses: 3, valorUnitario: 0.1 }), 0.3)
})

test('total das rubricas soma as linhas sem erro de centavos', () => {
  const linhas = [
    { meses: 3, valorUnitario: 0.1 },
    { meses: 1, valorUnitario: 0.2 },
    { meses: 12, valorUnitario: 4321.99 },
  ]
  assert.equal(totalRubricas(linhas), 51864.38)
  assert.equal(totalRubricas([]), 0)
})

test('parseRubricas normaliza linhas válidas', () => {
  const result = parseRubricas([
    { cargo: '  Engenheiro civil ', meses: 6, valorUnitario: 8000.005 },
    { cargo: 'Assistente', meses: 12, valorUnitario: 2500 },
  ])
  assert.deepEqual(result, {
    linhas: [
      { cargo: 'Engenheiro civil', meses: 6, valorUnitario: 8000.01 },
      { cargo: 'Assistente', meses: 12, valorUnitario: 2500 },
    ],
  })
})

test('parseRubricas recusa linhas incompletas', () => {
  assert.deepEqual(parseRubricas('x'), { error: 'linhas deve ser uma lista' })
  assert.deepEqual(parseRubricas([{ cargo: '', meses: 1, valorUnitario: 1 }]), { error: 'Linha 1: informe o cargo' })
  assert.match((parseRubricas([{ cargo: 'A', meses: 0, valorUnitario: 1 }]) as { error: string }).error, /meses/)
  assert.match((parseRubricas([{ cargo: 'A', meses: 1.5, valorUnitario: 1 }]) as { error: string }).error, /meses/)
  assert.match((parseRubricas([{ cargo: 'A', meses: 1, valorUnitario: -1 }]) as { error: string }).error, /valor/)
  // valor vazio chega como null no JSON e não pode virar zero
  assert.match((parseRubricas([{ cargo: 'A', meses: 1, valorUnitario: null }]) as { error: string }).error, /valor/)
  assert.match((parseRubricas([{ cargo: 'A', meses: 1, valorUnitario: '10' }]) as { error: string }).error, /valor/)
  assert.match((parseRubricas(Array(MAX_RUBRICAS + 1).fill({ cargo: 'A', meses: 1, valorUnitario: 1 })) as { error: string }).error, /Máximo/)
})

test('parseCurrencyInput lê o formato brasileiro', () => {
  assert.equal(parseCurrencyInput('1.234,56'), 1234.56)
  assert.equal(parseCurrencyInput('3500'), 3500)
  assert.equal(parseCurrencyInput('1.500'), 1500)
  assert.equal(parseCurrencyInput('R$ 1.500,00'), 1500)
  assert.equal(parseCurrencyInput('R$777,78'), 777.78)
  assert.ok(Number.isNaN(parseCurrencyInput('')))
})
