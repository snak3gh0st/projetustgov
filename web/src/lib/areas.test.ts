import assert from 'node:assert/strict'
import test from 'node:test'

import { activeNavHref, areaHome, getAreaNav, getAreasForRole, isNavItemActive, primaryAreaForRole, resolveArea } from './areas'
import type { Role } from './roles'

// Telas que cada perfil acessava no menu antes da separação por áreas (menu plano por papel).
const BEFORE: Record<Exclude<Role, 'diretoria'>, string[]> = {
  gestor: ['/', '/leads', '/execucao?fase=execucao', '/execucao?fase=prestacao_contas', '/operacao', '/comissoes', '/bi', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/csm', '/csm/comissoes', '/csm/bi', '/produtos-digitais', '/financeiro', '/admin/conta-azul', '/distribuir', '/cadastro-vendedor'],
  admin: ['/', '/leads', '/execucao?fase=execucao', '/execucao?fase=prestacao_contas', '/operacao', '/comissoes', '/bi', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/csm', '/csm/comissoes', '/csm/bi', '/produtos-digitais', '/financeiro', '/admin/conta-azul', '/distribuir', '/admin/system-health', '/cadastro-vendedor'],
  vendedor: ['/', '/leads', '/execucao?fase=execucao', '/execucao?fase=prestacao_contas', '/operacao', '/comissoes', '/bi'],
  visualizador: ['/', '/leads', '/comissoes', '/bi'],
  coordenador: ['/', '/leads', '/execucao?fase=execucao', '/execucao?fase=prestacao_contas', '/operacao', '/comissoes', '/bi', '/distribuir'],
  adm_produto: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/produtos-digitais', '/cadastro-vendedor'],
  csm: ['/csm', '/operacao', '/csm/comissoes', '/csm/bi', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov'],
  coord_aprovacao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/cadastro-vendedor'],
  assistente_aprovacao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/cadastro-vendedor'],
  projetista: ['/tgov/pipeline', '/tgov?view=dashboard', '/tgov'],
  coord_execucao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/cadastro-vendedor'],
  assistente_execucao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov'],
  coord_prestacao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov', '/cadastro-vendedor'],
  assistente_prestacao: ['/operacao', '/tgov/pipeline', '/tgov?view=dashboard', '/tgov'],
  gestor_financeiro: ['/financeiro', '/admin/conta-azul', '/comissoes', '/bi'],
}

const hrefsOf = (role: Role) => new Set(getAreasForRole(role).flatMap((a) => getAreaNav(role, a).map((i) => i.href)))
const none = new URLSearchParams()

test('nobody but gestor loses a screen', () => {
  for (const [role, before] of Object.entries(BEFORE)) {
    if (role === 'gestor') continue
    const now = hrefsOf(role as Role)
    for (const href of before) assert.ok(now.has(href), `${role} lost ${href}`)
  }
})

test('diretoria reaches every screen gestor had', () => {
  const now = hrefsOf('diretoria')
  for (const href of BEFORE.gestor) assert.ok(now.has(href), href)
})

test('gestor sees only commercial', () => {
  assert.deepEqual(getAreasForRole('gestor'), ['comercial'])
  const items = getAreaNav('gestor', 'comercial')
  for (const { href } of items) {
    assert.ok(!/^\/(tgov|operacao|financeiro|admin)/.test(href), href)
  }
  assert.ok(items.some((i) => i.href === '/cadastro-vendedor' && i.label === 'Equipe'))
})

test('diretoria lands in gestão and reaches every area', () => {
  assert.equal(primaryAreaForRole('diretoria'), 'gestao')
  assert.deepEqual([...getAreasForRole('diretoria')].sort(), ['admin', 'comercial', 'financeiro', 'gestao', 'operacao'])
})

test('vendedor sees no team screens', () => {
  assert.ok(!getAreaNav('vendedor', 'comercial').some((i) => i.section === 'Gestão'))
})

test('gestor_financeiro has one area with comissões a pagar', () => {
  assert.deepEqual(getAreasForRole('gestor_financeiro'), ['financeiro'])
  assert.ok(getAreaNav('gestor_financeiro', 'financeiro').some((i) => i.href === '/comissoes' && i.label === 'Comissões a pagar'))
})

test('loose screens stay in the main area menu', () => {
  assert.deepEqual(getAreasForRole('vendedor'), ['comercial'])
  assert.ok(getAreaNav('vendedor', 'comercial').some((i) => i.href === '/operacao'))
  assert.deepEqual(getAreasForRole('adm_produto'), ['operacao'])
  assert.ok(getAreaNav('adm_produto', 'operacao').some((i) => i.href === '/produtos-digitais'))
})

test('area home is the first screen of that area', () => {
  assert.equal(areaHome('gestor', 'comercial'), '/')
  assert.equal(areaHome('diretoria', 'financeiro'), '/financeiro')
})

test('shared screen follows the chosen area', () => {
  assert.equal(resolveArea('diretoria', '/bi', none, 'comercial'), 'comercial')
  assert.equal(resolveArea('diretoria', '/bi', none, 'gestao'), 'gestao')
  assert.equal(resolveArea('diretoria', '/bi', none), 'gestao')
})

test('unknown or foreign cookie is ignored', () => {
  assert.equal(resolveArea('vendedor', '/leads', none, 'financeiro'), 'comercial')
  assert.equal(resolveArea('vendedor', '/leads', none, 'lixo'), 'comercial')
  assert.equal(resolveArea('diretoria', '/rota-desconhecida', none, 'lixo'), 'gestao')
})

test('query-aware active item', () => {
  const dash = new URLSearchParams('view=dashboard')
  assert.equal(isNavItemActive('/tgov', '/tgov', dash), false)
  assert.equal(isNavItemActive('/tgov?view=dashboard', '/tgov', dash), true)
  assert.equal(isNavItemActive('/tgov', '/tgov', none), true)
  assert.equal(isNavItemActive('/execucao?fase=execucao', '/execucao', none), true)
  assert.equal(isNavItemActive('/execucao?fase=prestacao_contas', '/execucao', none), false)
  assert.equal(isNavItemActive('/', '/leads', none), false)
  assert.equal(isNavItemActive('/csmx', '/csm', none), false)
})

test('only the most specific item is active', () => {
  assert.equal(activeNavHref(['/csm', '/csm/comissoes', '/csm/bi'], '/csm/bi', none), '/csm/bi')
  assert.equal(activeNavHref(['/csm', '/csm/bi'], '/csm/client/123', none), '/csm')
  assert.equal(activeNavHref(['/', '/leads'], '/lead/123', none), null)
})
