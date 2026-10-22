import assert from 'node:assert/strict'
import test from 'node:test'

import { SendLimiter, aguardandoResposta, aguardandoSql, canManageConversations, canUseWhatsapp, conversationScopeSql, responsavelDaConversa, seesAllConversations } from './access'

test('gestão sees and manages every conversation; sellers use their own; others none', () => {
  for (const r of ['gestor', 'diretoria', 'admin']) {
    assert.equal(seesAllConversations(r), true, r)
    assert.equal(canManageConversations(r), true, r)
    assert.equal(canUseWhatsapp(r), true, r)
  }
  for (const r of ['vendedor', 'coordenador']) {
    assert.equal(seesAllConversations(r), false, r)
    assert.equal(canManageConversations(r), false, r)
    assert.equal(canUseWhatsapp(r), true, r)
  }
  for (const r of ['visualizador', 'csm', 'projetista', 'gestor_financeiro', 'adm_produto']) assert.equal(canUseWhatsapp(r), false, r)
})

test('the SQL scope follows the role', () => {
  assert.equal(conversationScopeSql('gestor', '$1'), 'TRUE')
  assert.equal(conversationScopeSql('visualizador', '$1'), 'FALSE')
  const seller = conversationScopeSql('vendedor', '$3', 'wc')
  assert.match(seller, /wc\.atendente_id = \$3/)
  assert.match(seller, /vendedor_id = \$3 OR vp\.closer_id = \$3/)
  assert.match(seller, /wc\.lead_cnpj IN/)
})

test('waiting for a reply only when the last received is after the last sent', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-22T10:00:00Z', ultima_enviada_em: null }), true)
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-22T10:00:00Z', ultima_enviada_em: '2026-10-22T09:00:00Z' }), true)
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-22T10:00:00Z', ultima_enviada_em: '2026-10-22T10:05:00Z' }), false)
  assert.equal(aguardandoResposta({ ultima_recebida_em: null, ultima_enviada_em: '2026-10-22T10:05:00Z' }), false)
})

test('the directed attendant answers; without one, the lead owners do', () => {
  assert.deepEqual(responsavelDaConversa({ atendente_id: 'b' }, ['a']), ['b'])
  assert.deepEqual(responsavelDaConversa({ atendente_id: null }, ['a', 'c']), ['a', 'c'])
  assert.deepEqual(responsavelDaConversa({ atendente_id: null }, []), [])
})

test('the limiter allows 20 sends a minute per user', () => {
  const lim = new SendLimiter(20, 60_000)
  for (let i = 0; i < 20; i++) assert.equal(lim.allow('u1', 1_000 + i), true, `envio ${i + 1}`)
  assert.equal(lim.allow('u1', 2_000), false)
  assert.equal(lim.allow('u2', 2_000), true)
  assert.equal(lim.allow('u1', 61_500), true)
})

test('history before the import never counts as waiting', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-09-01T10:00:00Z', ultima_enviada_em: null, historico_ate: '2026-10-23T12:00:00Z' }), false)
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-23T12:00:00Z', ultima_enviada_em: null, historico_ate: '2026-10-23T12:00:00Z' }), false)
})

test('a message after the import waits again', () => {
  assert.equal(aguardandoResposta({ ultima_recebida_em: '2026-10-24T09:00:00Z', ultima_enviada_em: '2026-09-01T10:00:00Z', historico_ate: '2026-10-23T12:00:00Z' }), true)
})

test('aguardandoSql keeps the historico_ate cut', () => {
  assert.match(aguardandoSql('wc'), /wc\.historico_ate/)
  assert.match(aguardandoSql('wc'), /wc\.ultima_recebida_em > wc\.ultima_enviada_em/)
})
