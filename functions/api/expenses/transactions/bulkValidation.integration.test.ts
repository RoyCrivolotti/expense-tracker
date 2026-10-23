// @vitest-environment node
/**
 * What the transaction routes say to a body that is not what they expect, over the real handlers and SQL. Each of
 * these used to reach a property read, a prototype member or a coercion, and answer 500 or do something the caller
 * did not write; they are refusals now, and nothing changes in the ledger.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { MAX_BULK_CREATE, MAX_NOTES_LENGTH } from '../../../../src/domain/application/transactionService'
import { createExpenseWorld, pinClock, type Handler, type World } from '../../../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../../../_shared/testing/seedLedger'
import { onRequestGet as getSummary } from './summary'
import { onRequestDelete as deleteBulk, onRequestPatch as patchBulk, onRequestPost as postBulk } from './bulk'
import { onRequestPost as postBulkLabels } from './bulk/labels'
import { onRequestPatch as patchOne } from './[id]'
import { onRequestPost as postOne } from './index'

let world: World
let sqlite: DatabaseSync
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

const count = (): number => (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n

const send = (handler: Handler, method: string, path: string, body: unknown, params?: Record<string, string>) =>
  world.call(handler, { method, path, body, ...(params ? { params } : {}) })

describe('a body of JSON null', () => {
  const routes: Array<[string, Handler, string, string]> = [
    ['PATCH /transactions/bulk', patchBulk, 'PATCH', '/transactions/bulk'],
    ['DELETE /transactions/bulk', deleteBulk, 'DELETE', '/transactions/bulk'],
    ['POST /transactions/bulk', postBulk, 'POST', '/transactions/bulk'],
    ['POST /transactions/bulk/labels', postBulkLabels, 'POST', '/transactions/bulk/labels'],
    ['POST /transactions', postOne, 'POST', '/transactions'],
  ]
  it.each(routes)('is a 400 on %s', async (_name, handler, method, path) => {
    const before = count()

    const response = await send(handler, method, path, null)

    expect(response.status).toBe(400)
    expect(count()).toBe(before)
  })

  it('is a 400 on PATCH /transactions/:id', async () => {
    const id = ids.transactions[0]!

    expect((await send(patchOne, 'PATCH', `/transactions/${id}`, null, { id: String(id) })).status).toBe(400)
  })
})

describe('a filter that names a member every object has', () => {
  const filters: Array<[string, unknown]> = [
    ['__proto__ holding a filter', JSON.parse('{"__proto__": {"month": "2026-10"}}')],
    ['__proto__', JSON.parse('{"__proto__": 1}')],
    ['constructor', { constructor: 'x' }],
    ['toString', { toString: 'x' }],
    ['hasOwnProperty', { hasOwnProperty: 1 }],
  ]
  it.each(filters)('is a 400 as the filter of an edit: %s', async (_name, filter) => {
    const summary = await world.call(getSummary, { path: '/transactions/summary' })
    const { count: expectedCount, revision: expectedRevision } = (await summary.json()) as { count: number; revision: string }

    const response = await send(patchBulk, 'PATCH', '/transactions/bulk', {
      filter,
      expectedCount,
      expectedRevision,
      patch: { description: 'changed' },
    })

    expect(response.status).toBe(400)
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM transactions WHERE description = 'changed'").get()).toEqual({ n: 0 })
  })
})

describe('ids that would have to be coerced', () => {
  it.each([true, '1', '1e1', ' 7 '])('delete nothing: %j', async (value) => {
    const before = count()

    const response = await send(deleteBulk, 'DELETE', '/transactions/bulk', { ids: [value] })

    expect(response.status).toBe(400)
    expect(count()).toBe(before)
  })

  it.each([{}, { ids: 'x' }, { ids: [] }, { ids: { length: 1 } }])('delete nothing when there is no list of them: %j', async (body) => {
    const before = count()

    expect((await send(deleteBulk, 'DELETE', '/transactions/bulk', body)).status).toBe(400)
    expect(count()).toBe(before)
  })

  it('edit nothing either', async () => {
    const response = await send(patchBulk, 'PATCH', '/transactions/bulk', { ids: [true], patch: { description: 'changed' } })

    expect(response.status).toBe(400)
  })
})

describe('sizes', () => {
  it('a bulk create of more than the cap is a 400 and writes nothing', async () => {
    const before = count()
    const row = { date: '2026-10-03', budgetMonth: '2026-10', description: 'x', accountId: ids.debit, categoryId: ids.groceries, type: 'expense', amountCents: 100 }

    const response = await send(postBulk, 'POST', '/transactions/bulk', { transactions: Array.from({ length: MAX_BULK_CREATE + 1 }, () => row) })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: `Too many transactions (max ${MAX_BULK_CREATE})` })
    expect(count()).toBe(before)
  })

  const created = (notes: string) => ({
    date: '2026-10-03',
    budgetMonth: '2026-10',
    description: 'x',
    accountId: ids.debit,
    categoryId: ids.groceries,
    type: 'expense',
    amountCents: 100,
    notes,
  })

  it('a note of the longest length is kept, and one character more is a 400 on create and on edit', async () => {
    const longest = 'n'.repeat(MAX_NOTES_LENGTH)
    expect((await send(postOne, 'POST', '/transactions', created(longest))).status).toBe(201)
    expect((await send(postOne, 'POST', '/transactions', created(`${longest}n`))).status).toBe(400)

    const id = ids.transactions[0]!
    const edit = (notes: string) => send(patchOne, 'PATCH', `/transactions/${id}`, { notes }, { id: String(id) })
    expect((await edit(longest)).status).toBe(200)
    expect((await edit(`${longest}n`)).status).toBe(400)
    expect((await edit('')).status).toBe(200)
  })

  it('names the row of a bulk create whose note is too long', async () => {
    const response = await send(postBulk, 'POST', '/transactions/bulk', { transactions: [created('ok'), created('n'.repeat(MAX_NOTES_LENGTH + 1))] })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: `Row 2: notes must be ${MAX_NOTES_LENGTH} characters or fewer` })
  })
})
