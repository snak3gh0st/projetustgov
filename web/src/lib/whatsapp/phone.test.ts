import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalPhone, phoneFromJid, phoneVariants } from './phone'

test('the same mobile written in different ways becomes one canonical number', () => {
  for (const raw of ['(61) 99876-5432', '5561998765432', '+55 61 9 9876-5432', '061998765432'.slice(1)]) {
    assert.equal(canonicalPhone(raw), '5561998765432', raw)
  }
})

test('a mobile stored without the 9 matches with and without it', () => {
  assert.deepEqual(phoneVariants('61 9876-5432'), ['6198765432', '61998765432'])
  assert.deepEqual(phoneVariants('61998765432'), ['61998765432', '6198765432'])
  assert.equal(canonicalPhone('61 9876-5432'), '5561998765432')
})

test('a landline only matches itself', () => {
  assert.deepEqual(phoneVariants('(61) 3333-4444'), ['6133334444'])
  assert.equal(canonicalPhone('(61) 3333-4444'), '556133334444')
})

test('invalid numbers give nothing', () => {
  for (const raw of ['', null, undefined, '9876-5432', '01198765432', 'abc']) {
    assert.equal(canonicalPhone(raw), null, String(raw))
    assert.deepEqual(phoneVariants(raw), [], String(raw))
  }
})

test('phone from a WhatsApp JID; groups, lid and broadcast give null', () => {
  assert.equal(phoneFromJid('5561998765432@s.whatsapp.net'), '5561998765432')
  assert.equal(phoneFromJid('556198765432@s.whatsapp.net'), '5561998765432')
  assert.equal(phoneFromJid('120363025246125244@g.us'), null)
  assert.equal(phoneFromJid('123456789012345@lid'), null)
  assert.equal(phoneFromJid('status@broadcast'), null)
  assert.equal(phoneFromJid(null), null)
})
