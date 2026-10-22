import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyMeuDia, type MeuDiaCandidate } from './meu-dia'

const NOW = new Date('2026-10-22T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

function lead(over: Partial<MeuDiaCandidate>): MeuDiaCandidate {
  return {
    cnpj: '1', nome: 'Lead', municipio: null, uf: null, funil: 'aprovacao',
    status: 'Contatado', atribuido_em: daysAgo(60), dias_sem_contato: null, ...over,
  }
}

test('a scheduled meeting goes only to reuniões, even when it is stale', () => {
  const r = classifyMeuDia([lead({ cnpj: 'a', status: 'Reunião Agendada', dias_sem_contato: 20 })], NOW)
  assert.deepEqual(r.reunioes.map((i) => i.cnpj), ['a'])
  assert.equal(r.parados.length, 0)
  assert.equal(r.reunioes[0].motivo, 'reuniao')
})

test('a lead not yet contacted is new only inside the 7-day window', () => {
  const r = classifyMeuDia([
    lead({ cnpj: 'recente', status: 'Não Contatado', atribuido_em: daysAgo(2) }),
    lead({ cnpj: 'antigo', status: 'Não Contatado', atribuido_em: daysAgo(10) }),
    lead({ cnpj: 'sem-data', status: 'Não Contatado', atribuido_em: null }),
  ], NOW)
  assert.deepEqual(r.novos.map((i) => i.cnpj), ['recente'])
  assert.equal(r.parados.length, 0)
})

test('more than 7 days without contact is stale; exactly 7 is not', () => {
  const r = classifyMeuDia([
    lead({ cnpj: 'oito', dias_sem_contato: 8 }),
    lead({ cnpj: 'sete', dias_sem_contato: 7 }),
    lead({ cnpj: 'nulo', dias_sem_contato: null }),
  ], NOW)
  assert.deepEqual(r.parados.map((i) => i.cnpj), ['oito'])
  assert.equal(r.parados[0].motivo, 'parado')
})

test('outcomes never show as stale', () => {
  const statuses = ['Fechado', 'Sem Interesse', 'Churn', 'Impedimento Técnico', 'Cancelado']
  const r = classifyMeuDia(statuses.map((status, i) => lead({ cnpj: String(i), status, dias_sem_contato: 30 })), NOW)
  assert.equal(r.parados.length, 0)
})

test('lists are ordered: newest assignment, longest stale, meetings by name', () => {
  const r = classifyMeuDia([
    lead({ cnpj: 'n1', status: 'Não Contatado', atribuido_em: daysAgo(5) }),
    lead({ cnpj: 'n2', status: 'Não Contatado', atribuido_em: daysAgo(1) }),
    lead({ cnpj: 'p1', dias_sem_contato: 9 }),
    lead({ cnpj: 'p2', dias_sem_contato: 30 }),
    lead({ cnpj: 'r1', nome: 'Zeta', status: 'Reunião Agendada' }),
    lead({ cnpj: 'r2', nome: 'Alfa', status: 'Reunião Agendada' }),
  ], NOW)
  assert.deepEqual(r.novos.map((i) => i.cnpj), ['n2', 'n1'])
  assert.deepEqual(r.parados.map((i) => i.cnpj), ['p2', 'p1'])
  assert.deepEqual(r.reunioes.map((i) => i.cnpj), ['r2', 'r1'])
})

test('the same CNPJ in two funnels stays as two items', () => {
  const r = classifyMeuDia([
    lead({ cnpj: 'x', funil: 'aprovacao', dias_sem_contato: 9 }),
    lead({ cnpj: 'x', funil: 'execucao', status: 'Reunião Agendada' }),
  ], NOW)
  assert.deepEqual(r.parados.map((i) => i.funil), ['aprovacao'])
  assert.deepEqual(r.reunioes.map((i) => i.funil), ['execucao'])
})

test('no candidates, empty lists', () => {
  assert.deepEqual(classifyMeuDia([], NOW), { novos: [], parados: [], reunioes: [] })
})
