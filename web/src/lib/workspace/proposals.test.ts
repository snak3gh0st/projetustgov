import test from 'node:test'
import assert from 'node:assert/strict'
import { proposalCopy, isProposal } from './proposals.ts'
import { buildMime } from './google.ts'

test('proposal copies use the server-configured manager and avoid duplicate recipients', () => {
  const env = { PROPOSAL_COPY_EMAIL: 'manager@example.test' }
  assert.equal(isProposal('Re: Proposta comercial'), true)
  assert.equal(isProposal('Atualização'), false)
  assert.deepEqual(proposalCopy('Proposta', false, 'seller@example.test', ['client@example.test'], env), ['manager@example.test'])
  assert.deepEqual(proposalCopy('Condições negociadas', true, 'seller@example.test', [], env), ['manager@example.test'])
  assert.deepEqual(proposalCopy('Proposta', true, 'manager@example.test', [], env), [])
  assert.deepEqual(proposalCopy('Proposta', true, 'seller@example.test', ['manager@example.test'], env), [])
})

test('MIME includes CC and rejects header injection', () => {
  const input = { from: 'seller@example.test', to: ['client@example.test'], cc: ['manager@example.test'], subject: 'Proposta', text: 'Olá', requestId: 'test' }
  assert.match(Buffer.from(buildMime(input), 'base64url').toString(), /\r\nCc: manager@example.test\r\n/)
  assert.throws(() => buildMime({ ...input, cc: ['manager@example.test\r\nBcc: outsider@example.test'] }))
})
