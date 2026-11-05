import assert from 'node:assert/strict'
import test from 'node:test'

import { isOperacaoKind, isOperacaoStatus } from './operacao'

test('accepts only the two operation overlay kinds', () => {
  assert.equal(isOperacaoKind('checklist'), true)
  assert.equal(isOperacaoKind('documento'), true)
  assert.equal(isOperacaoKind('arquivo'), false)
  assert.equal(isOperacaoKind(null), false)
  assert.equal(isOperacaoKind(42), false)
})

test('accepts checklist statuses only for checklist items', () => {
  assert.equal(isOperacaoStatus('checklist', 'pendente'), true)
  assert.equal(isOperacaoStatus('checklist', 'em_andamento'), true)
  assert.equal(isOperacaoStatus('checklist', 'concluido'), true)
  assert.equal(isOperacaoStatus('checklist', 'nao_aplicavel'), true)
  assert.equal(isOperacaoStatus('checklist', 'aprovado'), false)
})

test('accepts document statuses only for document items', () => {
  assert.equal(isOperacaoStatus('documento', 'pendente'), true)
  assert.equal(isOperacaoStatus('documento', 'em_analise'), true)
  assert.equal(isOperacaoStatus('documento', 'recebido'), true)
  assert.equal(isOperacaoStatus('documento', 'aprovado'), true)
  assert.equal(isOperacaoStatus('documento', 'rejeitado'), true)
  assert.equal(isOperacaoStatus('documento', 'nao_aplicavel'), true)
  assert.equal(isOperacaoStatus('documento', 'concluido'), false)
})

test('rejects non-string operation statuses', () => {
  assert.equal(isOperacaoStatus('checklist', null), false)
  assert.equal(isOperacaoStatus('documento', 1), false)
})
