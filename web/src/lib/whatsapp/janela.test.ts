import assert from 'node:assert/strict'
import test from 'node:test'

import { juntarMensagens, rotuloDia } from './janela'

test('day labels are Hoje, Ontem or the date, in São Paulo time', () => {
  const agora = new Date('2026-10-23T15:00:00-03:00')
  assert.equal(rotuloDia('2026-10-23T08:00:00-03:00', agora), 'Hoje')
  assert.equal(rotuloDia('2026-10-22T08:00:00-03:00', agora), 'Ontem')
  assert.equal(rotuloDia('2026-10-20T08:00:00-03:00', agora), '20/10/2026')
  // 23:30 em São Paulo já é dia 23 em UTC: continua sendo "Ontem" (22) para quem está no Brasil.
  assert.equal(rotuloDia('2026-10-23T02:30:00Z', agora), 'Ontem')
  // Virada do ano.
  assert.equal(rotuloDia('2025-12-31T12:00:00-03:00', new Date('2026-01-01T09:00:00-03:00')), 'Ontem')
})

type M = { id: number; enviada_em: string; status?: string }

test('older pages and polling merge without repeating or losing messages', () => {
  const antigas: M[] = [{ id: 1, enviada_em: '2026-10-20T10:00:00Z' }, { id: 2, enviada_em: '2026-10-21T10:00:00Z' }]
  const recentes: M[] = [{ id: 3, enviada_em: '2026-10-22T10:00:00Z', status: 'enviada' }, { id: 4, enviada_em: '2026-10-23T10:00:00Z' }]
  const tela = juntarMensagens(recentes, antigas)
  assert.deepEqual(tela.map((m) => m.id), [1, 2, 3, 4])
  // O polling traz só a página mais recente, com o status novo da 3: as antigas continuam.
  const poll: M[] = [{ id: 3, enviada_em: '2026-10-22T10:00:00Z', status: 'lida' }, { id: 4, enviada_em: '2026-10-23T10:00:00Z' }, { id: 5, enviada_em: '2026-10-23T11:00:00Z' }]
  const depois = juntarMensagens(tela, poll)
  assert.deepEqual(depois.map((m) => m.id), [1, 2, 3, 4, 5])
  assert.equal(depois.find((m) => m.id === 3)?.status, 'lida')
})

test('messages with the same time keep the id order', () => {
  const mesma = '2026-10-23T10:00:00Z'
  assert.deepEqual(juntarMensagens([{ id: 9, enviada_em: mesma }], [{ id: 7, enviada_em: mesma }, { id: 8, enviada_em: mesma }]).map((m) => m.id), [7, 8, 9])
})
