// @vitest-environment node
/**
 * Revoking a user removes their access first and their data second. When the second step fails, the user is already
 * revoked, so the same request must be able to run again and finish the purge: it was a 404 that left the data for good.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, pinClock, type World } from '../../_shared/testing/expenseWorld'
import { invokeApiRoute } from '../../_shared/testing/invokeApiRoute'
import { seedLedger } from '../../_shared/testing/seedLedger'
import { onRequestPost as revoke } from './admin/revoke'

let world: World
let sqlite: DatabaseSync

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const asOther = { ...world, call: (h, o = {}) => world.call(h, { ...o, email: OTHER }) } as World
  await seedLedger(asOther)
})

afterEach(() => {
  vi.useRealTimers()
})

const revokeOther = (email = OTHER) =>
  invokeApiRoute({
    handler: revoke,
    env: world.env,
    url: 'https://expenses.test/api/access/admin/revoke',
    method: 'POST',
    body: { email },
    email: OWNER,
  })

const rowsOf = (table: string, column = 'owner'): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(OTHER) as { n: number }).n

const status = (): string | undefined =>
  (sqlite.prepare('SELECT status FROM allowed_users WHERE email = ?').get(OTHER) as { status: string } | undefined)?.status

describe('revoking a user whose purge failed', () => {
  it('finishes the purge when the request is repeated', async () => {
    let failures = 1
    world.intercept((sql) => {
      if (sql.startsWith('DELETE FROM transactions WHERE owner') && failures-- > 0) throw new Error('D1 is down')
    })

    const first = await revokeOther()
    expect(first.status).toBe(500)
    expect(status()).toBe('revoked')
    expect(rowsOf('transactions')).toBeGreaterThan(0)

    const again = await revokeOther()

    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ email: OTHER, revoked: true, dataPurged: true })
    expect(rowsOf('transactions')).toBe(0)
    expect(rowsOf('categories')).toBe(0)
    expect(rowsOf('transaction_attachments')).toBe(0)
    expect(rowsOf('user_group_grants', 'email')).toBe(0)
  })

  it('can be repeated once more without harm, and leaves the other owner alone', async () => {
    expect((await revokeOther()).status).toBe(200)
    const ownersRows = (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE owner = ?').get(OWNER) as { n: number }).n

    expect((await revokeOther()).status).toBe(200)

    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE owner = ?').get(OWNER) as { n: number }).n).toBe(ownersRows)
  })

  it('is still a 404 for an address that was never allowed', async () => {
    expect((await revokeOther('nobody@example.com')).status).toBe(404)
  })

  it('still refuses to revoke the owner', async () => {
    expect((await revokeOther(OWNER)).status).toBe(400)
  })
})
