import assert from 'node:assert/strict'
import test from 'node:test'

import { CRM_STATUS_SELECT_OPTIONS, formatCrmStatusLabel } from './crm-catalog'
import { abreModalDeVenda, buildTimeline, contatoExibido, execucaoStatusDoCnpj, faseDaSituacao, responsaveis, type TimelineEvent, type TimelineNote } from './lead-timeline'

const note = (id: string, at: string): TimelineNote => ({
  id, lead_cnpj: '1', vendedor_id: 'u', vendedor_nome: 'Ana', tipo: 'ligacao', observacao: 'x', created_at: at, updated_at: at,
})
const event = (at: string, para = 'Contatado'): TimelineEvent => ({
  cnpj: '1', nome: null, tipo: 'status', de: 'Não Contatado', para, autor_nome: 'Ana', origem: 'manual', linhas: 1, comissao_valor: null, created_at: at,
})

test('notes and moves come together, oldest first', () => {
  const items = buildTimeline(
    [note('n2', '2026-10-20T10:00:00Z'), note('n1', '2026-10-18T10:00:00Z')],
    [event('2026-10-19T10:00:00Z'), event('2026-10-21T10:00:00Z', 'Proposta Enviada')],
    'tudo',
  )
  assert.deepEqual(items.map((i) => i.at), [
    '2026-10-18T10:00:00Z', '2026-10-19T10:00:00Z', '2026-10-20T10:00:00Z', '2026-10-21T10:00:00Z',
  ])
  assert.deepEqual(items.map((i) => i.kind), ['nota', 'evento', 'nota', 'evento'])
})

test('filters keep only notes or only moves', () => {
  const notes = [note('n1', '2026-10-18T10:00:00Z')]
  const events = [event('2026-10-19T10:00:00Z')]
  assert.deepEqual(buildTimeline(notes, events, 'notas').map((i) => i.kind), ['nota'])
  assert.deepEqual(buildTimeline(notes, events, 'movimentacoes').map((i) => i.kind), ['evento'])
})

test('items at the same instant keep a stable, unique order', () => {
  const at = '2026-10-18T10:00:00Z'
  const items = buildTimeline([note('a', at), note('b', at)], [event(at), event(at, 'Proposta Enviada')], 'tudo')
  assert.equal(new Set(items.map((i) => i.id)).size, 4)
  assert.deepEqual(buildTimeline([note('a', at), note('b', at)], [event(at), event(at, 'Proposta Enviada')], 'tudo').map((i) => i.id), items.map((i) => i.id))
})

test('fase of a convênio comes from its TransfereGov situation', () => {
  assert.equal(faseDaSituacao('Em execução'), 'execucao')
  assert.equal(faseDaSituacao('Em Execução'), 'execucao')
  assert.equal(faseDaSituacao('Prestação de Contas em Análise'), 'prestacao_contas')
  assert.equal(faseDaSituacao('Prestação de Contas enviada para Análise'), 'prestacao_contas')
  assert.equal(faseDaSituacao('Concluído'), null)
  assert.equal(faseDaSituacao(null), null)
})

test('the Execução status of a CNPJ is the most advanced of its rows, like the list', () => {
  const rows = (...statuses: (string | null)[]) => statuses.map((s) => ({ status: s, updated_at: '2026-10-01T00:00:00Z' }))
  assert.equal(execucaoStatusDoCnpj(rows(null, 'Contatado', 'Proposta')), 'Proposta Enviada')
  assert.equal(execucaoStatusDoCnpj(rows('Aguardando Closer', 'Contatado')), 'Em Aprovação')
  assert.equal(execucaoStatusDoCnpj(rows(null, null)), 'Não Contatado')
  assert.equal(execucaoStatusDoCnpj([]), 'Não Contatado')
  assert.equal(execucaoStatusDoCnpj(rows('Retorno', 'Ainda Não')), 'Em Atendimento')
})

test('legacy Execução values always land on a status the select can show', () => {
  for (const legacy of ['Quente', 'Muito Quente', 'Telefone Invalido', 'Retorno', 'Aguardando Closer', 'Contactado', 'Cancelado', 'Impedimento Tecnico', 'Fechado']) {
    const label = formatCrmStatusLabel(execucaoStatusDoCnpj([{ status: legacy, updated_at: null }]))
    assert.ok((CRM_STATUS_SELECT_OPTIONS as readonly string[]).includes(label), `${legacy} -> ${label}`)
  }
})

test('responsáveis are the distinct owners, without blanks', () => {
  assert.deepEqual(responsaveis([{ vendedor_nome: 'Ana' }, { vendedor_nome: null }, { vendedor_nome: 'Caio' }, { vendedor_nome: 'Ana' }]), ['Ana', 'Caio'])
  assert.deepEqual(responsaveis([{ vendedor_nome: null }]), [])
})

test('ties in the Execução ranking go to the most recently updated row, like the list', () => {
  assert.equal(execucaoStatusDoCnpj([
    { status: 'Churn', updated_at: '2026-10-01T00:00:00Z' },
    { status: 'Vendas Aprovação', updated_at: '2026-10-05T00:00:00Z' },
  ]), 'Fechado')
  assert.equal(execucaoStatusDoCnpj([
    { status: 'Vendas Aprovação', updated_at: '2026-10-01T00:00:00Z' },
    { status: 'Churn', updated_at: '2026-10-05T00:00:00Z' },
  ]), 'Churn')
})

test('existing events keep their keys when a newer move arrives', () => {
  const older = event('2026-10-19T10:00:00Z')
  const before = buildTimeline([], [older], 'tudo').map((i) => i.id)
  const after = buildTimeline([], [event('2026-10-21T10:00:00Z', 'Proposta Enviada'), older], 'tudo').map((i) => i.id)
  assert.ok(after.includes(before[0]))
})

test('the card shows the first contact (main first) and edits where the value came from', () => {
  const contacts = [
    { id: 2, principal: false, created_at: '2026-01-02T00:00:00Z', telefone: '222', email: null },
    { id: 1, principal: true, created_at: '2026-01-03T00:00:00Z', telefone: '111', email: null },
  ]
  const shown = contatoExibido(contacts, { telefone: '999', email: 'lead@x.org' })
  assert.deepEqual(shown.telefone, { valor: '111', contatoId: 1 })
  assert.deepEqual(shown.email, { valor: 'lead@x.org', contatoId: null })
  const semContatos = contatoExibido([], { telefone: '999', email: null })
  assert.deepEqual(semContatos.telefone, { valor: '999', contatoId: null })
  assert.deepEqual(semContatos.email, { valor: null, contatoId: null })
})

test('the sale modal opens only when a lead enters the closed stage, not when the stage advances', () => {
  assert.equal(abreModalDeVenda('Em Aprovação', 'Vendas Aprovação'), true)
  assert.equal(abreModalDeVenda('Fechado', 'Execução/Prestação'), false)
  assert.equal(abreModalDeVenda('Fechado', 'Vendas Aprovação'), false)
  assert.equal(abreModalDeVenda('Contatado', 'Reunião Agendada'), false)
})
