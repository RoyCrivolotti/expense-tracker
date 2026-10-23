// @vitest-environment node
/**
 * A receipt's bytes are in no backup, so they may only leave the bucket once the rows that name them have gone.
 * These run the delete routes over the real handlers and SQL, with the receipt of a seeded transaction in a bucket
 * stand-in, and look at both halves after each way a delete can end.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../../src/testing/sqliteD1'
import { createExpenseWorld, pinClock, type World } from '../../../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../../../_shared/testing/seedLedger'
import { onRequestGet as getAttachment } from '../attachments/[id]'
import { onRequestDelete as deleteOne } from './[id]'
import { onRequestDelete as deleteBulk } from './bulk'

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

/** The transaction with the seeded receipt. */
const withReceipt = (): number => ids.transactions[0]!

async function bytesServed(): Promise<boolean> {
  const params = { id: String(ids.attachment) }
  return (await world.call(getAttachment, { path: `/attachments/${ids.attachment}`, params })).status === 200
}

const rows = (table: 'transactions' | 'transaction_attachments', id: number): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'transactions' ? 'id' : 'transaction_id'} = ?`).get(id) as { n: number }).n

const bulk = (idsBody: unknown) =>
  world.call(deleteBulk, { method: 'DELETE', path: '/transactions/bulk', body: { ids: idsBody } })

const single = (id: number) => world.call(deleteOne, { method: 'DELETE', path: `/transactions/${id}`, params: { id: String(id) } })

describe('a delete that is refused leaves the receipt files alone', () => {
  it('for an id that is not a number', async () => {
    const response = await bulk([withReceipt(), 'not-a-number'])

    expect(response.status).toBe(400)
    expect(rows('transactions', withReceipt())).toBe(1)
    expect(await bytesServed()).toBe(true)
  })

  it('for more ids than a request may name', async () => {
    const response = await bulk([withReceipt(), ...Array.from({ length: 500 }, (_, i) => 900_000 + i)])

    expect(response.status).toBe(400)
    expect(rows('transactions', withReceipt())).toBe(1)
    expect(await bytesServed()).toBe(true)
  })
})

describe('a delete that fails leaves the receipt files alone', () => {
  const failTheRowDelete = (): void =>
    world.intercept((sql) => {
      if (sql.startsWith('DELETE FROM transactions WHERE')) throw new Error('D1 is down')
    })

  it('for a bulk delete', async () => {
    failTheRowDelete()

    expect((await bulk([withReceipt()])).status).toBe(500)

    expect(rows('transactions', withReceipt())).toBe(1)
    expect(rows('transaction_attachments', withReceipt())).toBe(1)
    expect(await bytesServed()).toBe(true)
  })

  it('for a single delete', async () => {
    failTheRowDelete()

    expect((await single(withReceipt())).status).toBe(500)

    expect(rows('transactions', withReceipt())).toBe(1)
    expect(await bytesServed()).toBe(true)
  })

  it('when the keys cannot be read, which is before anything has been deleted', async () => {
    world.intercept((sql) => {
      if (sql.includes('SELECT object_key, thumb_key FROM transaction_attachments')) throw new Error('D1 is down')
    })

    expect((await bulk([withReceipt()])).status).toBe(500)

    expect(rows('transactions', withReceipt())).toBe(1)
    expect(await bytesServed()).toBe(true)
  })
})

describe('a delete that goes through takes the receipt files after the rows', () => {
  it('for a bulk delete', async () => {
    const response = await bulk([withReceipt()])

    expect(response.status).toBe(200)
    expect(rows('transactions', withReceipt())).toBe(0)
    expect(rows('transaction_attachments', withReceipt())).toBe(0)
    expect(await bytesServed()).toBe(false)
  })

  it('for a single delete', async () => {
    expect((await single(withReceipt())).status).toBe(200)

    expect(rows('transactions', withReceipt())).toBe(0)
    expect(await bytesServed()).toBe(false)
  })

  it('asking the bucket only once the rows are gone', async () => {
    const seen: number[] = []
    vi.spyOn(world.env.RECEIPTS!, 'delete').mockImplementation(() => {
      seen.push(rows('transactions', withReceipt()))
      return Promise.resolve()
    })

    await bulk([withReceipt()])

    expect(seen).toEqual([0])
  })

  it('and still answers 200 when the bucket cannot delete them, the orphaned file costing only space', async () => {
    vi.spyOn(world.env.RECEIPTS!, 'delete').mockRejectedValue(new Error('R2 is down'))

    expect((await bulk([withReceipt()])).status).toBe(200)

    expect(rows('transactions', withReceipt())).toBe(0)
    expect(rows('transaction_attachments', withReceipt())).toBe(0)
  })

  it('and still answers 200 for a single delete when the bucket cannot delete them', async () => {
    vi.spyOn(world.env.RECEIPTS!, 'delete').mockRejectedValue(new Error('R2 is down'))

    expect((await single(withReceipt())).status).toBe(200)

    expect(rows('transactions', withReceipt())).toBe(0)
  })

  it('without touching the bucket for a transaction that has no receipt', async () => {
    const spy = vi.spyOn(world.env.RECEIPTS!, 'delete')

    expect((await single(ids.spareTransaction)).status).toBe(200)

    expect(spy).not.toHaveBeenCalled()
    expect(await bytesServed()).toBe(true)
  })
})
