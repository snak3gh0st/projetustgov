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
  canRunSystemSetup,
  canWriteOperacao,
  canWriteTgov,
  hasTeamCommercialView,
  redactLeadCommission,
  seesAllLeads,
  canEditLeads,
  canReopenClosedSale,
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

test('only diretoria can run the system setup that rewrites users', () => {
  assert.deepEqual(ALL_ROLES.filter((r) => canRunSystemSetup(r)), ['diretoria'])
})

const COMMISSION_ROW = {
  id: 1,
  vendedor_id: 'u1',
  valor_venda: 100000,
  comissao_valor: 5000,
  comissao_percentual: 5,
  comissao_bonus: 2000,
  closer_comissao_valor: 3000,
  closer_comissao_percentual: 3,
}

test('gestor, diretoria and admin keep every commission field', () => {
  for (const role of ['gestor', 'diretoria', 'admin']) {
    assert.deepEqual(redactLeadCommission(COMMISSION_ROW, role), COMMISSION_ROW, role)
  }
})

test('sellers keep their own commission but not bonus or closer figures', () => {
  for (const role of ['vendedor', 'coordenador']) {
    assert.deepEqual(redactLeadCommission(COMMISSION_ROW, role, 'u1'), {
      ...COMMISSION_ROW, comissao_bonus: null, closer_comissao_valor: null, closer_comissao_percentual: null,
    }, role)
  }
})

test('visualizador and other roles get no commission at all', () => {
  for (const role of ['visualizador', 'gestor_financeiro', 'csm']) {
    assert.deepEqual(redactLeadCommission(COMMISSION_ROW, role, 'u1'), {
      id: 1, vendedor_id: 'u1', valor_venda: 100000, comissao_valor: null, comissao_percentual: null, comissao_bonus: null,
      closer_comissao_valor: null, closer_comissao_percentual: null,
    }, role)
  }
})

test('a seller who is only the closer does not see the owner commission', () => {
  const out = redactLeadCommission(COMMISSION_ROW, 'coordenador', 'u2')
  assert.equal(out.comissao_valor, null)
  assert.equal(out.comissao_percentual, null)
  assert.equal(out.valor_venda, 100000)
})

test('visualizador and csm only look at leads; sellers and managers edit', () => {
  for (const role of ['gestor', 'diretoria', 'admin', 'vendedor', 'coordenador']) assert.equal(canEditLeads(role), true, role)
  for (const role of ['visualizador', 'csm', 'gestor_financeiro', 'projetista']) assert.equal(canEditLeads(role), false, role)
})

test('only gestores and admin undo a closed sale', () => {
  for (const role of ['gestor', 'diretoria', 'admin']) assert.equal(canReopenClosedSale(role), true, role)
  for (const role of ['vendedor', 'coordenador', 'visualizador', 'csm']) assert.equal(canReopenClosedSale(role), false, role)
})

test('csm sees every lead, like the visualizador', () => {
  assert.equal(seesAllLeads('csm'), true)
  assert.equal(seesAllLeads('vendedor'), false)
})

test('csm stays out of TransfereGov and Operação, keeps the CSM area', () => {
  for (const can of [canReadTgov, canCommentTgov, canReadOperacao, canWriteTgov, canWriteOperacao]) {
    assert.equal(can('csm'), false, can.name)
  }
  assert.equal(canCsm('csm'), true)
})
