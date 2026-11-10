import test from 'node:test'
import assert from 'node:assert/strict'

const d = await import('../src/lib/finance/domain.ts').catch(() => ({}))

test('monetary amounts preserve cents and reject invalid or sub-cent amounts', () => {
  assert.equal(typeof d.toCents, 'function', 'finance monetary rules must exist')
  assert.equal(d.toCents('1000.29'), 100029)
  assert.equal(d.toCents(0.1), 10)
  for (const n of ['1.001', '-1', 'NaN', '', Infinity]) assert.throws(() => d.toCents(n))
})

test('installments preserve total and clamp month-end without date drift', () => {
  assert.equal(typeof d.buildSchedule, 'function', 'installment scheduler must exist')
  assert.deepEqual(d.buildSchedule(10000, 3, '2028-01-31'), [
    { dueDate: '2028-01-31', amountCents: 3334 },
    { dueDate: '2028-02-29', amountCents: 3333 },
    { dueDate: '2028-03-31', amountCents: 3333 },
  ])
  assert.throws(() => d.buildSchedule(2, 3, '2026-11-01'))
  assert.throws(() => d.buildSchedule(100, 1, '2026-02-31'))
})

test('closing payment rolls December to January and rejects invalid periods', () => {
  assert.equal(typeof d.closingDueDate, 'function')
  assert.equal(d.closingDueDate('2026-12'), '2027-01-15')
  assert.equal(d.closingDueDate('2026-10'), '2026-11-15')
  assert.throws(() => d.closingDueDate('2026-13'))
})

const purchase = (extra = {}) => ({ id: 'event-1', creation_date: 1793876400000,
  event: 'PURCHASE_APPROVED', data: {
    product: { id: 12, name: 'Mentoria' }, buyer: { name: 'Aluno', email: 'aluno@example.test' },
    purchase: { transaction: 'HP001', status: 'APPROVED', approved_date: 1793876400000,
      price: { value: 300, currency_value: 'BRL' }, payment: { installments_number: 12 }, ...extra },
  } })

test('Hotmart normalizes actual transaction without inventing twelve future payments', () => {
  assert.equal(typeof d.normalizeHotmart, 'function')
  const p = d.normalizeHotmart(purchase())
  assert.equal(p.externalKey, 'HP001')
  assert.equal(p.amountCents, 30000)
  assert.equal(p.billingMode, 'review')
  assert.equal(p.paymentStatus, 'paid')
  assert.equal(p.installments, undefined)
})

test('Hotmart subscriptions and terminal refund events remain distinct from pending payments', () => {
  assert.equal(typeof d.normalizeHotmart, 'function')
  assert.equal(d.normalizeHotmart(purchase({ is_subscription: true })).billingMode, 'subscription')
  const p = purchase({ status: 'REFUNDED' }); p.event = 'PURCHASE_REFUNDED'
  assert.equal(d.normalizeHotmart(p).paymentStatus, 'refunded')
  assert.throws(() => d.normalizeHotmart(purchase({ price: { value: 3, currency_value: 'USD' } })))
  assert.throws(() => d.normalizeHotmart({ event: 'PURCHASE_APPROVED', data: {} }))
})

test('reports count outstanding balance and payments by payment date, keeping unsynced figures separate', () => {
  assert.equal(typeof d.summarizeReport, 'function')
  const r = d.summarizeReport([
    { origin: 'conta_azul', kind: 'receivable', amountCents: 10000, settledCents: 4000, dueDate: '2026-11-04', paidDate: '2026-11-05', payments: [{ date: '2026-11-05', amountCents: 4000 }], status: 'partial' },
    { origin: 'conta_azul', kind: 'payable', amountCents: 2000, settledCents: 0, dueDate: '2026-11-05', status: 'open' },
    { origin: 'projete', kind: 'receivable', amountCents: 5000, settledCents: 0, dueDate: '2026-11-05', status: 'open' },
    { origin: 'conta_azul', kind: 'receivable', amountCents: 9000, settledCents: 0, dueDate: '2026-11-01', status: 'canceled' },
  ], '2026-11-05')
  assert.equal(r.overdueReceivableCents, 6000)
  assert.equal(r.payableTodayCents, 2000)
  assert.equal(r.receivedTodayCents, 4000)
  assert.equal(r.unsyncedReceivableCents, 5000)
  assert.equal(r.receivableTodayCents, 0)
})

test('CSV exports prevent formula execution and keep separators inside quoted cells', () => {
  assert.equal(typeof d.csvCell, 'function')
  assert.equal(d.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(d.csvCell('a;b'), '"a;b"')
})
