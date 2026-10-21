import assert from 'node:assert/strict'
import test from 'node:test'

import { commercialOnlyBlock } from './area-access'

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
