import test from 'node:test'
import assert from 'node:assert/strict'
import { isManagementCrmStatus, normalizeCrmStatus } from './crm-catalog'

test('consultants may submit for approval and record losses; closing still requires management', () => {
  assert.equal(isManagementCrmStatus('Em Aprovação'), false)
  assert.equal(isManagementCrmStatus('Aprovação'), false)
  assert.equal(isManagementCrmStatus('Churn'), false)
  assert.equal(isManagementCrmStatus('Vendas Aprovação'), true)
  assert.equal(isManagementCrmStatus('Execução/Prestação'), true)
})

test('legacy cancellations are losses, while inactive leads remain in follow-up', () => {
  assert.equal(normalizeCrmStatus('Cancelado'), 'Churn')
  assert.equal(normalizeCrmStatus('Retorno'), 'Em Atendimento')
  assert.equal(normalizeCrmStatus('Impedimento Técnico'), 'Em Atendimento')
})
