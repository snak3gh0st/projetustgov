import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'

import { downloadTgovTable, tgovSourcesUsed } from './tgov-repo'

// Single-entry ZIP with a local file header, the layout the government files use.
function zipOf(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content, 'utf8'))
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt32LE(data.length, 18)
  header.writeUInt32LE(Buffer.byteLength(content), 22)
  header.writeUInt16LE(Buffer.byteLength(name), 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, Buffer.from(name), data])
}

const CSV = '﻿ID_PROPOSTA;NM_PROPONENTE\r\n1;Alfa\r\n2;Beta\r\n'

function mockFetch(blocked: string[]) {
  const calls: { method: string; url: string }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url })
    if (blocked.some((b) => url.startsWith(b))) return new Response('challenge', { status: 403 })
    if (method === 'HEAD') return new Response(null, { status: 200 })
    return new Response(new Uint8Array(zipOf('siconv_proposta.csv', CSV)), { status: 200 })
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

test('uses the new host when it answers', async () => {
  const { calls, restore } = mockFetch([])
  try {
    const rows: Record<string, string>[] = []
    await downloadTgovTable('siconv_proposta', (r) => { rows.push(r) })
    assert.deepEqual(rows.map((r) => r.NM_PROPONENTE), ['Alfa', 'Beta'])
    assert.equal(tgovSourcesUsed().siconv_proposta, 'atual')
    const get = calls.find((c) => c.method === 'GET')
    assert.equal(get?.url, 'https://api-publica.transferegov.gestao.gov.br/downloads/dadosgov/siconv_proposta.zip')
  } finally {
    restore()
  }
})

test('read-only callers fall back to the legacy host when the new one is challenged, reading rows once', async () => {
  const { calls, restore } = mockFetch(['https://api-publica.transferegov.gestao.gov.br'])
  try {
    const rows: Record<string, string>[] = []
    await downloadTgovTable('siconv_proposta', (r) => { rows.push(r) }, { allowLegacy: true })
    assert.equal(rows.length, 2)
    assert.equal(tgovSourcesUsed().siconv_proposta, 'legado')
    const gets = calls.filter((c) => c.method === 'GET')
    assert.deepEqual(gets.map((c) => c.url), ['https://repositorio.dados.gov.br/seges/detru/siconv_proposta.csv.zip'])
  } finally {
    restore()
  }
})

test('TGOV_REPO_BASE override is tried first', async () => {
  process.env.TGOV_REPO_BASE = 'https://espelho.example/dadosgov/'
  const { calls, restore } = mockFetch([])
  try {
    await downloadTgovTable('siconv_proposta', () => {})
    assert.equal(tgovSourcesUsed().siconv_proposta, 'override')
    assert.equal(calls.find((c) => c.method === 'GET')?.url, 'https://espelho.example/dadosgov/siconv_proposta.zip')
  } finally {
    restore()
    delete process.env.TGOV_REPO_BASE
  }
})

test('writers never read the frozen legacy snapshot: blocked source fails before any row', async () => {
  const { calls, restore } = mockFetch(['https://api-publica.transferegov.gestao.gov.br'])
  try {
    let rows = 0
    await assert.rejects(downloadTgovTable('siconv_proposta', () => { rows++ }), /nenhuma linha desta tabela foi gravada/)
    assert.equal(rows, 0)
    assert.ok(!calls.some((c) => c.url.startsWith('https://repositorio.dados.gov.br')))
  } finally {
    restore()
  }
})

test('fails loudly when no source answers', async () => {
  const { restore } = mockFetch(['https://'])
  try {
    await assert.rejects(downloadTgovTable('siconv_proposta', () => {}, { allowLegacy: true }), /Fonte atual do Transferegov bloqueada/)
  } finally {
    restore()
  }
})
