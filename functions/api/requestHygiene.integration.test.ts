// @vitest-environment node
/**
 * The /api middleware's request checks, over the real handlers and SQL: a write that a page on another site could have
 * caused is refused before anything is read or written.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { createExpenseWorld, pinClock, type Handler, type World } from '../_shared/testing/expenseWorld'
import { seedLedger, uploadForm, type SeededIds } from '../_shared/testing/seedLedger'
import { onRequestPost as upload } from './expenses/attachments/index'
import { onRequestDelete as deleteOne, onRequestGet as getOne } from './expenses/transactions/[id]'
import { onRequestPost as postBulk } from './expenses/transactions/bulk'
import { onRequestPost as postTransaction } from './expenses/transactions/index'
import { onRequestPost as requestAccess } from './access/request'

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

const NEW_TRANSACTION = { date: '2026-10-03', budgetMonth: '2026-10', description: 'Coffee', accountId: 0, categoryId: 0, type: 'expense', amountCents: 350 }
const count = (): number => (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n
const body = () => JSON.stringify({ ...NEW_TRANSACTION, accountId: ids.debit, categoryId: ids.groceries })

const post = (handler: Handler, headers: Record<string, string>, rawBody?: BodyInit) =>
  world.call(handler, { method: 'POST', path: '/transactions', headers, ...(rawBody !== undefined ? { rawBody } : {}) })

describe('a write that could have come from another site', () => {
  it.each(['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])(
    'is refused with a 415 as %s, and writes nothing',
    async (type) => {
      const before = count()
      const token = world.token()

      const response = await post(postTransaction, { 'content-type': type }, body())

      expect(response.status).toBe(415)
      expect(count()).toBe(before)
      expect(world.token()).toBe(token)
    },
  )

  it('is refused with a 415 when it sends a JSON body without saying so', async () => {
    const response = await post(postTransaction, {}, body())

    expect(response.status).toBe(415)
  })

  it('is refused with a 403 when the browser says it is cross-site, even with the right type', async () => {
    const before = count()
    const token = world.token()

    const response = await post(postTransaction, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body())

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Cross-site requests are refused' })
    expect(count()).toBe(before)
    expect(world.token()).toBe(token)
  })

  it('is refused before the person is known, so a cross-site request learns nothing about access', async () => {
    const anonymous = await world.call(postBulk, { method: 'POST', path: '/transactions/bulk', headers: { 'sec-fetch-site': 'cross-site' }, email: '' })

    expect(anonymous.status).toBe(403)
  })

  it('is refused on a delete too', async () => {
    const response = await world.call(deleteOne, {
      method: 'DELETE',
      path: `/transactions/${ids.spareTransaction}`,
      params: { id: String(ids.spareTransaction) },
      headers: { 'sec-fetch-site': 'cross-site' },
    })

    expect(response.status).toBe(403)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?').get(ids.spareTransaction)).toEqual({ n: 1 })
  })

  it('is refused on the access routes too', async () => {
    const response = await post(requestAccess, { 'sec-fetch-site': 'cross-site' })

    expect(response.status).toBe(403)
  })
})

describe('a write the app sends', () => {
  it('is let through as JSON, from the same origin or with no Sec-Fetch-Site', async () => {
    const before = count()

    expect((await post(postTransaction, { 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'same-origin' }, body())).status).toBe(201)
    expect((await post(postTransaction, { 'content-type': 'application/json' }, body())).status).toBe(201)

    expect(count()).toBe(before + 2)
  })

  it('is let through as a delete with no body', async () => {
    const response = await world.call(deleteOne, {
      method: 'DELETE',
      path: `/transactions/${ids.spareTransaction}`,
      params: { id: String(ids.spareTransaction) },
      headers: { 'sec-fetch-site': 'same-origin' },
    })

    expect(response.status).toBe(200)
  })

  it('is let through as the multipart receipt upload', async () => {
    const response = await world.call(upload, { method: 'POST', path: '/attachments', rawBody: uploadForm(ids.transactions[1]!), headers: { 'sec-fetch-site': 'same-origin' } })

    expect(response.status).toBe(201)
  })

  it('is let through as a request for access, which has no body', async () => {
    const response = await post(requestAccess, { 'sec-fetch-site': 'same-origin' })

    expect(response.status).not.toBe(403)
    expect(response.status).not.toBe(415)
  })
})

describe('a read from another site', () => {
  it('is not refused', async () => {
    const response = await world.call(getOne, { path: `/transactions/${ids.transactions[0]}`, params: { id: String(ids.transactions[0]) }, headers: { 'sec-fetch-site': 'cross-site' } })

    expect(response.status).toBe(200)
  })
})
