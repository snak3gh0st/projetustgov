import assert from 'node:assert/strict'
import test from 'node:test'

import { leadTabsForRole, leadsHref, legacyExecucaoTarget, resolveLeadTab } from './lead-tabs'

test('sellers and managers get the three lead tabs', () => {
  for (const role of ['vendedor', 'coordenador', 'gestor', 'diretoria', 'admin'] as const) {
    assert.deepEqual(leadTabsForRole(role), ['aprovacao', 'execucao', 'prestacao_contas'], role)
  }
})

test('visualizador gets only aprovação; operação roles get none', () => {
  assert.deepEqual(leadTabsForRole('visualizador'), ['aprovacao'])
  assert.deepEqual(leadTabsForRole('projetista'), [])
})

test('the tab falls back to the first allowed one', () => {
  assert.equal(resolveLeadTab('vendedor', 'prestacao_contas'), 'prestacao_contas')
  assert.equal(resolveLeadTab('visualizador', 'execucao'), 'aprovacao')
  assert.equal(resolveLeadTab('vendedor', 'lixo'), 'aprovacao')
  assert.equal(resolveLeadTab('vendedor', null), 'aprovacao')
})

test('old /execucao links land on the matching tab with their filters', () => {
  const q = (s: string) => new URLSearchParams(s)
  assert.equal(legacyExecucaoTarget(q('fase=prestacao_contas&status=Contatado')), '/leads?fase=prestacao_contas&status=Contatado')
  assert.equal(legacyExecucaoTarget(q('')), '/leads?fase=execucao')
  assert.equal(legacyExecucaoTarget(q('fase=todas')), '/leads?fase=execucao')
  assert.equal(legacyExecucaoTarget(q('alert_only=true')), '/leads?fase=execucao&alert_only=true')
})

test('leadsHref builds tab links', () => {
  assert.equal(leadsHref('aprovacao'), '/leads')
  assert.equal(leadsHref('execucao', { status: 'X' }), '/leads?fase=execucao&status=X')
  assert.equal(leadsHref('aprovacao', { status_contato: 'Contatado' }), '/leads?status_contato=Contatado')
})
