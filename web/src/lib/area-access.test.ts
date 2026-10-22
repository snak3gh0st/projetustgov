import assert from 'node:assert/strict'
import test from 'node:test'

import { commercialOnlyBlock, csmCanReadCommercial } from './area-access'

test('gestor is redirected away from other areas pages', () => {
  for (const path of ['/tgov', '/tgov/pipeline', '/operacao', '/financeiro', '/financeiro/resultado', '/admin/conta-azul', '/admin/system-health']) {
    assert.equal(commercialOnlyBlock('gestor', path), 'redirect', path)
  }
})

test('gestor gets forbid on other areas APIs', () => {
  for (const path of ['/api/tgov/notifications', '/api/operacao', '/api/operacao/123', '/api/financeiro/sync', '/api/integrations/conta-azul', '/api/integrations/conta-azul/test']) {
    assert.equal(commercialOnlyBlock('gestor', path), 'forbid', path)
  }
})

test('gestor passes commercial pages and APIs', () => {
  for (const path of ['/', '/leads', '/execucao', '/comissoes', '/bi', '/csm', '/distribuir', '/cadastro-vendedor', '/api/usuarios', '/api/leads', '/api/dashboard-crm']) {
    assert.equal(commercialOnlyBlock('gestor', path), null, path)
  }
})

test('diretoria, admin and others are never blocked here', () => {
  for (const role of ['diretoria', 'admin', 'vendedor', 'projetista', undefined]) {
    for (const path of ['/tgov/pipeline', '/financeiro', '/api/tgov/notifications', '/admin/system-health']) {
      assert.equal(commercialOnlyBlock(role, path), null, `${role} ${path}`)
    }
  }
})

test('prefix match respects path boundaries', () => {
  assert.equal(commercialOnlyBlock('gestor', '/tgovx'), null)
  assert.equal(commercialOnlyBlock('gestor', '/operacaox'), null)
})

test('csm reads the execução list, its detail, contacts, notes and history', () => {
  for (const path of ['/api/execucao', '/api/execucao/12345678000199', '/api/leads', '/api/leads/12345678000199/contacts', '/api/leads/12345678000199/notes', '/api/leads/12345678000199/historico']) {
    assert.equal(csmCanReadCommercial(path, 'GET'), true, path)
  }
})

test('csm cannot write or reach other commercial APIs', () => {
  assert.equal(csmCanReadCommercial('/api/execucao/12345678000199', 'PATCH'), false)
  assert.equal(csmCanReadCommercial('/api/leads/12345678000199/contacts', 'POST'), false)
  assert.equal(csmCanReadCommercial('/api/leads/12345678000199/notes', 'POST'), false)
  for (const path of ['/api/execucao/distribute', '/api/execucao/export', '/api/leads/assign', '/api/leads/12345678000199', '/api/comissoes', '/api/leads/export-pendentes']) {
    assert.equal(csmCanReadCommercial(path, 'GET'), false, path)
  }
})
