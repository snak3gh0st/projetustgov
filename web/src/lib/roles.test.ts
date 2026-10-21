import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ALL_ROLES,
  ROLE_CAN_CREATE,
  ROLE_CAN_DELETE,
  buildVendedorFilter,
  canCommentTgov,
  canCsm,
  canExportContacts,
  canManageContaAzul,
  canModifyData,
  canReadBiFinanceiro,
  canReadOperacao,
  canReadTgov,
  canWriteOperacao,
  canWriteTgov,
  hasTeamCommercialView,
  seesAllLeads,
} from './roles'

// Lista que o gestor podia gerenciar antes da separação por áreas.
const OLD_GESTOR_MANAGES = [
  'admin', 'vendedor', 'visualizador', 'coordenador', 'adm_produto', 'csm', 'coord_aprovacao',
  'assistente_aprovacao', 'projetista', 'coord_execucao', 'assistente_execucao', 'coord_prestacao',
  'assistente_prestacao', 'gestor_financeiro',
]

test('diretoria can do everything gestor could, plus operação, tgov and finance', () => {
  for (const can of [
    canCommentTgov, canCsm, canExportContacts, canManageContaAzul, canModifyData, canReadBiFinanceiro,
    canReadOperacao, canReadTgov, canWriteOperacao, canWriteTgov, hasTeamCommercialView, seesAllLeads,
  ]) {
    assert.equal(can('diretoria'), true, can.name)
  }
})

test('gestor is commercial only', () => {
  for (const can of [canReadTgov, canWriteTgov, canCommentTgov, canReadOperacao, canWriteOperacao, canManageContaAzul, canReadBiFinanceiro]) {
    assert.equal(can('gestor'), false, can.name)
  }
  for (const can of [canCsm, canModifyData, canExportContacts, hasTeamCommercialView, seesAllLeads]) {
    assert.equal(can('gestor'), true, can.name)
  }
})

test('team commission view is only for gestor and diretoria', () => {
  const allowed = ALL_ROLES.filter((r) => hasTeamCommercialView(r))
  assert.deepEqual([...allowed].sort(), ['diretoria', 'gestor'])
})

test('gestor manages only commercial users', () => {
  assert.deepEqual(ROLE_CAN_CREATE.gestor, ['vendedor', 'coordenador', 'csm', 'visualizador'])
  assert.deepEqual(ROLE_CAN_DELETE.gestor, ['vendedor', 'coordenador', 'csm', 'visualizador'])
})

test('diretoria manages what gestor managed, plus gestor', () => {
  assert.deepEqual(ROLE_CAN_CREATE.diretoria, [...OLD_GESTOR_MANAGES, 'gestor'])
  assert.deepEqual(ROLE_CAN_DELETE.diretoria, [...OLD_GESTOR_MANAGES, 'gestor'])
})

test('diretoria sees every lead, like gestor', () => {
  assert.deepEqual(buildVendedorFilter('diretoria', 'u1', 1), { clause: '', params: [], nextIndex: 1 })
  assert.deepEqual(buildVendedorFilter('vendedor', 'u1', 1).params, ['u1'])
})
