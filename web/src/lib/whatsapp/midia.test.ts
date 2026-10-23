import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_ARQUIVO, classificarArquivo, exibivel } from './midia'

test('only photos, audio and video are shown on the page', () => {
  for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg; codecs=opus', 'audio/mpeg', 'video/mp4', 'video/webm']) {
    assert.equal(exibivel(t), true, t)
  }
  // HTML ou SVG exibidos no domínio do PROJETE rodariam código com a sessão de quem abriu.
  for (const t of ['text/html', 'image/svg+xml', 'application/pdf', '', 'IMAGE/SVG+XML']) {
    assert.equal(exibivel(t), false, t)
  }
})

test('a file is sent as voice, image, video or document', () => {
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: 'audio/webm;codecs=opus', voz: true }), { ok: true, tipo: 'audio', mediatype: 'audio' })
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: 'image/jpeg', voz: false }), { ok: true, tipo: 'imagem', mediatype: 'image' })
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: 'video/mp4', voz: false }), { ok: true, tipo: 'video', mediatype: 'video' })
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: 'application/pdf', voz: false }), { ok: true, tipo: 'documento', mediatype: 'document' })
  // Formato que o WhatsApp não mostra como foto vai como documento.
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: 'image/heic', voz: false }), { ok: true, tipo: 'documento', mediatype: 'document' })
  assert.deepEqual(classificarArquivo({ tamanho: 1000, mimetype: '', voz: false }), { ok: true, tipo: 'documento', mediatype: 'document' })
})

test('empty or too large files are refused', () => {
  assert.equal(classificarArquivo({ tamanho: 0, mimetype: 'image/jpeg', voz: false }).ok, false)
  const grande = classificarArquivo({ tamanho: MAX_ARQUIVO + 1, mimetype: 'application/pdf', voz: false })
  assert.equal(grande.ok, false)
  assert.match(!grande.ok ? grande.erro : '', /16 MB/)
  assert.equal(classificarArquivo({ tamanho: MAX_ARQUIVO, mimetype: 'application/pdf', voz: false }).ok, true)
})
