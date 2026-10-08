import assert from 'node:assert/strict'
import test from 'node:test'

import { reconcile } from './reconcile'

const api = {
  RECEITA: { itens: 1019, pago: 4164502.23, aberto: 638559.68 },
  DESPESA: { itens: 2248, pago: 4929294.26, aberto: 3048002.03 },
}

test('mirror matching the API totals within R$ 1 is ok', () => {
  const r = reconcile(api, [
    { tipo: 'RECEITA', itens: 1019, pago: 4164502.5, aberto: 638559.68 },
    { tipo: 'DESPESA', itens: 2248, pago: 4929294.26, aberto: 3048001.2 },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.checks.length, 6)
  assert.ok(r.checks.every((c) => c.ok))
})

test('a difference above R$ 1 or a missing item fails with details', () => {
  const r = reconcile(api, [
    { tipo: 'RECEITA', itens: 1018, pago: 4164502.23, aberto: 637319.68 },
    { tipo: 'DESPESA', itens: 2248, pago: 4929294.26, aberto: 3048002.03 },
  ])
  assert.equal(r.ok, false)
  const bad = r.checks.filter((c) => !c.ok).map((c) => `${c.tipo}:${c.campo}:${c.diferenca}`)
  assert.deepEqual(bad, ['RECEITA:itens:-1', 'RECEITA:aberto:-1240'])
})

test('missing tipo in the mirror counts as zero', () => {
  const r = reconcile(api, [{ tipo: 'RECEITA', itens: 1019, pago: 4164502.23, aberto: 638559.68 }])
  assert.equal(r.ok, false)
  assert.ok(r.checks.some((c) => c.tipo === 'DESPESA' && c.campo === 'pago' && c.espelho === 0))
})

test('totals the API did not return are skipped, not failed', () => {
  const r = reconcile({ RECEITA: { itens: null, pago: null, aberto: 10 }, DESPESA: { itens: null, pago: null, aberto: null } }, [
    { tipo: 'RECEITA', itens: 3, pago: 5, aberto: 10 },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.checks.length, 1)
})
