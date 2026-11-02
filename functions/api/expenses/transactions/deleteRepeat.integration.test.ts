// @vitest-environment node
/**
 * A delete whose answer is lost is sent again by the browser, and the repeat finds the row gone. The person wanted the
 * row gone and it is, so the repeat answers ok like the first, over the real handlers and SQL. A row that is not the
 * caller's looks the same as a missing one, so it is answered the same way and left alone.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { REVISION_AFTER_HEADER, REVISION_BEFORE_HEADER } from '../../../domain/data/writeReceipt'
import { OTHER, createExpenseWorld, pinClock, type World } from '../../../_shared/testing/expenseWorld'
import { expense, seedLedger, uploadForm, type SeededIds } from '../../../_shared/testing/seedLedger'
import { onRequestPost as postAccount } from '../accounts/index'
import { onRequestPost as postAttachment } from '../attachments/index'
import { onRequestPost as postCategory } from '../categories/index'
import { onRequestDelete as deleteOne } from './[id]'
import { onRequestPost as postTransaction } from './index'

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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const withReceipt = (): number => ids.transactions[0]!

const remove = (id: number | string, email?: string) =>
  world.call(deleteOne, { method: 'DELETE', path: `/transactions/${id}`, params: { id: String(id) }, ...(email ? { email } : {}) })

const rows = (id: number): number => (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?').get(id) as { n: number }).n

const receipt = (response: Response) => ({
  before: response.headers.get(REVISION_BEFORE_HEADER),
  after: response.headers.get(REVISION_AFTER_HEADER),
})

/** A row of the other owner's, with a receipt, made through the routes. */
async function otherOwnersRow(): Promise<number> {
  const post = async (handler: Parameters<World['call']>[0], path: string, body: unknown) => {
    const response = await world.call(handler, { method: 'POST', path, body, email: OTHER })
    return (await response.json<{ id: number }>()).id
  }
  const accountId = await post(postAccount, '/accounts', { name: 'Theirs', kind: 'debit', settlement: 'immediate', active: true })
  const categoryId = await post(postCategory, '/categories', { name: 'Theirs', monthlyBudgetCents: 0, sortOrder: 0, active: true })
  const id = await post(postTransaction, '/transactions', expense(accountId, categoryId, 'Not yours', '2026-10-10'))
  await world.call(postAttachment, { method: 'POST', path: '/attachments', rawBody: uploadForm(id), email: OTHER })
  return id
}

describe('a delete that is sent twice', () => {
  it('answers ok both times and leaves the revision moving the way any write moves it', async () => {
    const start = world.token()

    const first = await remove(ids.spareTransaction)
    const afterFirst = world.token()
    const second = await remove(ids.spareTransaction)

    expect([first.status, await first.json()]).toEqual([200, { ok: true }])
    expect([second.status, await second.json()]).toEqual([200, { ok: true }])
    expect(rows(ids.spareTransaction)).toBe(0)
    // The repeat changes nothing, but it is still a write to the middleware: the token moves and the receipt chains.
    expect(receipt(first)).toEqual({ before: start, after: afterFirst })
    expect(receipt(second)).toEqual({ before: afterFirst, after: world.token() })
    expect(afterFirst).not.toBe(start)
    expect(world.token()).not.toBe(afterFirst)
  })

  it('takes the receipt file once, and the repeat neither fails nor asks the bucket for anything', async () => {
    const bucket = vi.spyOn(world.env.RECEIPTS!, 'delete')

    expect((await remove(withReceipt())).status).toBe(200)
    expect(bucket).toHaveBeenCalledTimes(1)
    expect((await remove(withReceipt())).status).toBe(200)

    expect(bucket).toHaveBeenCalledTimes(1)
    expect(rows(withReceipt())).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_attachments WHERE transaction_id = ?').get(withReceipt())).toEqual({ n: 0 })
  })
})

describe('a delete of a row that is not there', () => {
  it('answers ok for an id that never existed', async () => {
    const response = await remove(987_654)

    expect([response.status, await response.json()]).toEqual([200, { ok: true }])
  })

  it('answers ok for another owner’s row and leaves it and its receipt alone', async () => {
    const theirs = await otherOwnersRow()
    const bucket = vi.spyOn(world.env.RECEIPTS!, 'delete')

    const response = await remove(theirs)

    expect([response.status, await response.json()]).toEqual([200, { ok: true }])
    expect(rows(theirs)).toBe(1)
    expect(bucket).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_attachments WHERE transaction_id = ?').get(theirs)).toEqual({ n: 1 })
  })
})

describe('a delete that is still refused', () => {
  it.each(['abc', '0', '-3'])('answers 400 for the id %s', async (id) => {
    expect((await remove(id)).status).toBe(400)
  })

  it('answers 500 when the database fails, and the row stays', async () => {
    world.intercept((sql) => {
      if (sql.startsWith('DELETE FROM transactions WHERE')) throw new Error('D1 is down')
    })

    expect((await remove(ids.spareTransaction)).status).toBe(500)
    expect(rows(ids.spareTransaction)).toBe(1)
  })
})
