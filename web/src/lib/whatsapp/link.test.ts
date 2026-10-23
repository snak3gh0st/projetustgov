import assert from 'node:assert/strict'
import test from 'node:test'

import { linkWhatsapp } from './link'

test('with the channel on for the user, the button opens the conversation in PROJETE', () => {
  assert.deepEqual(linkWhatsapp('(61) 99220-2071', { noProjete: true, cnpj: '00.394.460/0001-41' }), {
    href: '/conversas?telefone=5561992202071&cnpj=00394460000141',
    externo: false,
  })
  // Celular sem o 9 e sem lead: mesmo número canônico, sem cnpj.
  assert.deepEqual(linkWhatsapp('6192202071', { noProjete: true }), { href: '/conversas?telefone=5561992202071', externo: false })
})

test('without the channel the button keeps opening the WhatsApp app', () => {
  assert.deepEqual(linkWhatsapp('(61) 99220-2071', { noProjete: false, cnpj: '00394460000141' }), {
    href: 'https://wa.me/5561992202071',
    externo: true,
  })
})

test('an incomplete phone has no WhatsApp link', () => {
  assert.equal(linkWhatsapp('9922-2071', { noProjete: true }), null)
  assert.equal(linkWhatsapp(null, { noProjete: false }), null)
})
