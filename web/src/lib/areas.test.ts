import assert from 'node:assert/strict'
import test from 'node:test'

import { activeNavHref, areaHome, getAreaNav, getAreasForRole, isNavItemActive, landingPath, primaryAreaForRole, resolveArea } from './areas'
import { leadTabsForRole } from './lead-tabs'
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

// /execucao?fase=F virou a aba F da página Leads: conta como alcançada se o perfil tem Leads e a aba.
function reaches(role: Role, href: string): boolean {
  const now = hrefsOf(role)
  // O Pipeline de quem abre em outra tela (Meu dia, Visão geral) mudou para /pipeline.
  if (href === '/' && (role === 'vendedor' || role === 'diretoria')) return now.has('/pipeline')
  const legacy = href.match(/^\/execucao\?fase=(.+)$/)
  if (legacy) return now.has('/leads') && leadTabsForRole(role).includes(legacy[1] as never)
  return now.has(href)
}
const none = new URLSearchParams()

// Gestor e CSM ficaram só no Comercial (o CSM passou para o time do Rooger).
test('nobody but gestor and csm loses a screen', () => {
  for (const [role, before] of Object.entries(BEFORE)) {
    if (role === 'gestor' || role === 'csm') continue
    for (const href of before) assert.ok(reaches(role as Role, href), `${role} lost ${href}`)
  }
})

test('diretoria reaches every screen gestor had', () => {
  for (const href of BEFORE.gestor) assert.ok(reaches('diretoria', href), href)
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

test('screen outside every menu keeps the chosen area', () => {
  assert.equal(resolveArea('diretoria', '/lead/123', none, 'comercial'), 'comercial')
  assert.equal(resolveArea('diretoria', '/lead/123', none), 'gestao')
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
  assert.equal(isNavItemActive('/', '/leads', none), false)
  assert.equal(isNavItemActive('/csmx', '/csm', none), false)
})

test('only the most specific item is active', () => {
  assert.equal(activeNavHref(['/csm', '/csm/comissoes', '/csm/bi'], '/csm/bi', none), '/csm/bi')
  assert.equal(activeNavHref(['/csm', '/csm/bi'], '/csm/client/123', none), '/csm')
  assert.equal(activeNavHref(['/', '/leads'], '/lead/123', none), null)
})

test('the three lead lists are one Leads item', () => {
  for (const role of ['vendedor', 'gestor', 'visualizador'] as const) {
    const leads = getAreaNav(role, 'comercial').filter((i) => i.label.startsWith('Leads'))
    assert.deepEqual(leads.map((i) => i.href), ['/leads'], role)
  }
})

test('csm sees only commercial, with its CSM screens', () => {
  assert.deepEqual(getAreasForRole('csm'), ['comercial'])
  const hrefs = getAreaNav('csm', 'comercial').map((i) => i.href)
  for (const href of hrefs) assert.ok(!/^\/(tgov|operacao|financeiro|admin)/.test(href), href)
  for (const href of ['/csm', '/csm/comissoes', '/csm/bi']) assert.ok(hrefs.includes(href), href)
  assert.deepEqual(getAreaNav('csm', 'operacao'), [])
})

test('vendedor opens in Meu dia, with the Pipeline right after', () => {
  const hrefs = getAreaNav('vendedor', 'comercial').map((i) => i.href)
  assert.deepEqual(hrefs.slice(0, 2), ['/meu-dia', '/pipeline'])
  assert.ok(!hrefs.includes('/'))
  assert.equal(areaHome('vendedor', 'comercial'), '/meu-dia')
})

test('coordenador keeps the team Pipeline first and has Meu dia in the menu', () => {
  const hrefs = getAreaNav('coordenador', 'comercial').map((i) => i.href)
  assert.equal(hrefs[0], '/')
  assert.ok(hrefs.includes('/meu-dia'))
  assert.equal(areaHome('coordenador', 'comercial'), '/')
})

test('only consultores get Meu dia', () => {
  for (const role of ['gestor', 'diretoria', 'admin', 'visualizador', 'csm'] as const) {
    assert.ok(!hrefsOf(role).has('/meu-dia'), role)
  }
})

test('diretoria opens in Visão geral and keeps the commercial Pipeline at /pipeline', () => {
  assert.equal(areaHome('diretoria', 'gestao'), '/gestao')
  assert.equal(getAreaNav('diretoria', 'gestao')[0].label, 'Visão geral')
  const comercial = getAreaNav('diretoria', 'comercial').map((i) => i.href)
  assert.ok(comercial.includes('/pipeline'))
  assert.ok(!comercial.includes('/'))
})

test('admin has Visão geral in Gestão but keeps / as the Pipeline', () => {
  assert.equal(getAreaNav('admin', 'gestao')[0].href, '/gestao')
  assert.ok(getAreaNav('admin', 'comercial').some((i) => i.href === '/'))
})

test('landing path: consultor in Meu dia, diretoria in Visão geral, others stay on /', () => {
  assert.equal(landingPath('vendedor'), '/meu-dia')
  assert.equal(landingPath('diretoria'), '/gestao')
  for (const role of ['gestor', 'coordenador', 'admin', 'visualizador'] as const) assert.equal(landingPath(role), null, role)
})

test('landingPath agrees with the home of the main area where it redirects', () => {
  for (const role of ['vendedor', 'diretoria'] as const) {
    assert.equal(landingPath(role), areaHome(role, primaryAreaForRole(role)), role)
  }
})

test('Conversas only shows with WhatsApp on, and never for visualizador or csm', () => {
  for (const role of ['vendedor', 'coordenador', 'gestor', 'diretoria', 'admin'] as const) {
    assert.ok(!getAreaNav(role, 'comercial').some((i) => i.href === '/conversas'), `${role} sem canal`)
    assert.ok(getAreaNav(role, 'comercial', { whatsapp: true }).some((i) => i.href === '/conversas'), `${role} com canal`)
  }
  for (const role of ['visualizador', 'csm'] as const) {
    assert.ok(!getAreaNav(role, 'comercial', { whatsapp: true }).some((i) => i.href === '/conversas'), role)
  }
})
