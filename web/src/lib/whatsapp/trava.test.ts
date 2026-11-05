import assert from 'node:assert/strict'
import test from 'node:test'

import { comTrava } from './trava'

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Roda as tarefas juntas e devolve o maior número delas dentro da trava ao mesmo tempo. */
async function maiorSobreposicao(chavesPorTarefa: string[][]): Promise<number> {
  let dentro = 0
  let maior = 0
  await Promise.all(chavesPorTarefa.map((chaves) => comTrava(chaves, async () => {
    dentro++
    maior = Math.max(maior, dentro)
    await pausa(5)
    dentro--
  })))
  return maior
}

test('messages of the same contact are recorded one at a time', async () => {
  assert.equal(await maiorSobreposicao([['lid'], ['lid', 'tel'], ['lid'], ['tel', 'lid']]), 1)
})

test('a message known by lid and phone waits for both halves', async () => {
  assert.equal(await maiorSobreposicao([['lid'], ['tel'], ['lid', 'tel']]), 2)
  // A do par só entra quando as duas metades saíram.
  const ordem: string[] = []
  await Promise.all([
    comTrava(['lid'], async () => { await pausa(10); ordem.push('lid') }),
    comTrava(['tel'], async () => { await pausa(20); ordem.push('tel') }),
    comTrava(['lid', 'tel'], async () => { ordem.push('par') }),
  ])
  assert.deepEqual(ordem, ['lid', 'tel', 'par'])
})

test('different contacts are recorded in parallel', async () => {
  assert.equal(await maiorSobreposicao([['a'], ['b'], ['c']]), 3)
})

test('an error releases the lock and reaches the caller', async () => {
  await assert.rejects(comTrava(['x'], async () => { throw new Error('falhou') }), /falhou/)
  assert.equal(await comTrava(['x'], async () => 'ok'), 'ok')
})
