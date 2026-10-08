import assert from 'node:assert/strict'
import test from 'node:test'

import { getNavItemsForRole, groupNavItems, navSectionOrderForRole } from './sidebar-nav-items'

test('gestor_financeiro opens on the Financeiro section, BI Financeiro first', () => {
  const items = getNavItemsForRole('gestor_financeiro')
  assert.equal(items[0].href, '/financeiro')
  const groups = groupNavItems(items, navSectionOrderForRole('gestor_financeiro'))
  assert.equal(groups[0].section, 'Financeiro')
  assert.deepEqual(groups[0].items.map((i) => i.href), ['/financeiro', '/admin/conta-azul'])
})

test('gestor and admin also reach the Financeiro area', () => {
  for (const role of ['gestor', 'admin'] as const) {
    const groups = groupNavItems(getNavItemsForRole(role), navSectionOrderForRole(role))
    const fin = groups.find((g) => g.section === 'Financeiro')
    assert.ok(fin, role)
    assert.deepEqual(fin.items.map((i) => i.href), ['/financeiro', '/admin/conta-azul'])
    assert.equal(groups[0].section, 'Operação')
  }
})

test('roles without finance access do not see it', () => {
  for (const role of ['vendedor', 'coordenador', 'visualizador', 'csm', 'adm_produto'] as const) {
    assert.ok(!getNavItemsForRole(role).some((i) => i.href === '/financeiro' || i.href === '/admin/conta-azul'), role)
  }
})
