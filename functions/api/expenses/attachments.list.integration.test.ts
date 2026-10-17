// @vitest-environment node
/**
 * The receipts of one transaction, through the real auth middleware and the D1 adapter's SQL on SQLite
 * with the real migrations. The ledger parts say which rows have receipts (`attachmentCounts`) instead of
 * listing them; this is how one row's receipts are fetched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../../_shared/testing/seedLedger'
import { onRequestGet as getAttachments } from './attachments/index'

let world: World
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

async function get(path: string, email?: string) {
  const response = await world.call(getAttachments, { path, ...(email ? { email } : {}) })
  return { response, text: await response.text() }
}

describe('GET /attachments?transactionId=', () => {
  it('lists the receipts of one of the caller’s transactions', async () => {
    const { response, text } = await get(`/attachments?transactionId=${ids.transactions[0]}`)

    expect(response.status).toBe(200)
    const list = JSON.parse(text) as Array<{ id: number; transactionId: number }>
    expect(list.map((a) => [a.id, a.transactionId])).toEqual([[ids.attachment, ids.transactions[0]]])
  })

  it('lists nothing for a transaction without receipts, and nothing for another owner’s transaction', async () => {
    expect(JSON.parse((await get(`/attachments?transactionId=${ids.transactions[1]}`)).text)).toEqual([])
    const theirs = await get(`/attachments?transactionId=${ids.transactions[0]}`, OTHER)
    expect(theirs.response.status).toBe(200)
    expect(JSON.parse(theirs.text)).toEqual([])
  })

  it.each([['none', '/attachments'], ['zero', '/attachments?transactionId=0'], ['text', '/attachments?transactionId=x'], ['a fraction', '/attachments?transactionId=1.5'], ['an extra parameter', '/attachments?transactionId=1&owner=x']])(
    'refuses %s with a 400',
    async (_label, url) => {
      expect((await get(url)).response.status).toBe(400)
    },
  )
})
