// @vitest-environment node
/**
 * A ledger held open keeps its revision across the writes its own user makes, end to end: `apiDataSource` sending
 * through the real auth middleware (which bumps the token around the write and sends the receipt), the routes and the
 * D1 adapter on SQLite with the real migrations. What is checked is which requests the browser made to read the next
 * month, and that what it holds then is what the database holds.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { LedgerSession } from '../../../src/data/ledgerSession'
import { onWriteReceipt } from '../../../src/data/writeReceipts'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../../../src/domain/ledger'
import { patchAfterSettings, patchAfterTransactionCreate } from '../../../src/ui/datasetPatches'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getReference } from './reference'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPost as postTransaction } from './transactions/index'
import { onRequestGet as getMonths } from './transactions/months'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const source = apiDataSource as Required<typeof apiDataSource>

let sqlite: DatabaseSync
let world: World
let sent: string[]
/** Runs inside the settings write, between the two bumps the middleware makes around it, as another request would. */
let during: (() => Promise<unknown>) | undefined
let stopListening: () => void

function routeFetch() {
  const handlers: Array<[string, string, Handler]> = [
    [
      '/api/expenses/settings',
      'PUT',
      async (context) => {
        await during?.()
        return putSettings(context)
      },
    ],
    [
      '/api/expenses/transactions',
      'POST',
      async (context) => {
        await during?.()
        return postTransaction(context)
      },
    ],
    ['/api/expenses/transactions/months', 'GET', getMonths],
    ['/api/expenses/reference', 'GET', getReference],
    ['/api/expenses/cube', 'GET', getCube],
  ]
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const method = init?.method ?? 'GET'
    const handler = handlers.find(([path, verb]) => path === url.pathname && verb === method)?.[2]
    if (!handler) throw new Error(`no route for ${method} ${url.pathname}`)
    sent.push(url.pathname.replace('/api/expenses', ''))
    return world.call(handler, {
      method,
      path: `${url.pathname.slice('/api/expenses'.length)}${url.search}`,
      ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}),
    })
  }
}

const monthsInDb = (): string[] =>
  (sqlite.prepare('SELECT DISTINCT budget_month AS month FROM transactions WHERE owner = ? ORDER BY month').all(OWNER) as Array<{ month: string }>).map(
    (row) => row.month,
  )

const idsInDb = (month: string): number[] =>
  (sqlite.prepare('SELECT id FROM transactions WHERE owner = ? AND budget_month = ? ORDER BY id').all(OWNER, month) as Array<{ id: number }>).map((row) => row.id)

const idsHeld = (session: LedgerSession, month: string): number[] =>
  (session.getState().held!.rows.get(month) ?? []).map((row) => row.id).sort((a, b) => a - b)

/** A write made here: sent, receipt noted by the listener, then its patch, as the screens do it. */
async function saveSettings(session: LedgerSession): Promise<void> {
  const saved = await source.updateSettings({ openingCashCents: 4_200 })
  session.patch((d) => patchAfterSettings(d, saved, ['openingCashCents']))
}

const newRow = (month: string, description: string) => {
  const account = (sqlite.prepare('SELECT id FROM accounts WHERE owner = ? ORDER BY id LIMIT 1').get(OWNER) as { id: number }).id
  const category = (sqlite.prepare('SELECT id FROM categories WHERE owner = ? ORDER BY id LIMIT 1').get(OWNER) as { id: number }).id
  return { date: `${month}-15`, budgetMonth: month, description, accountId: account, categoryId: category, type: 'expense' as const, amountCents: 999, cancelled: false }
}

/** A row added by someone else: no receipt reaches the session. */
async function addElsewhere(month: string): Promise<number> {
  const response = await world.call(postTransaction, { method: 'POST', path: '/transactions', body: newRow(month, 'Added elsewhere') })
  expect(response.status).toBe(201)
  return ((await response.json()) as { id: number }).id
}

/** A row added here, with the patch the screens apply; the sums of its month are read after it. */
async function addHere(session: LedgerSession, month: string): Promise<void> {
  const added = await source.createTransaction(newRow(month, 'Added here'))
  session.patch((d) => patchAfterTransactionCreate(d, added))
}

async function opened(): Promise<LedgerSession> {
  const session = new LedgerSession(source, { policy: WINDOWED })
  stopListening = onWriteReceipt(session.noteReceipt)
  await session.open()
  sent.length = 0
  return session
}

beforeEach(() => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  seedDataset(sqlite, OWNER, syntheticLedger({ months: 30, perMonth: 50, seed: 1 }))
  sent = []
  during = undefined
  vi.stubGlobal('fetch', routeFetch())
})

afterEach(() => {
  stopListening?.()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the next month read after a write made here', () => {
  it('is read on its own: no reference, no sums, no rows of the months already held', async () => {
    const session = await opened()
    const oldest = monthsInDb()[0]!

    await saveSettings(session)
    sent.length = 0
    await session.view(oldest)

    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((path) => path === '/transactions/months')).toBe(true)
    expect(idsHeld(session, oldest)).toEqual(idsInDb(oldest))
  })

  it('goes on being read on its own across a second write and another month', async () => {
    const session = await opened()
    const months = monthsInDb()

    await saveSettings(session)
    await session.view(months[0]!)
    await saveSettings(session)
    sent.length = 0
    await session.view(months[12]!)

    expect(sent.every((path) => path === '/transactions/months')).toBe(true)
    expect(idsHeld(session, months[12]!)).toEqual(idsInDb(months[12]!))
  })

  it('is read on its own after a row written to a month that is held, whose sums were read in between', async () => {
    const session = await opened()
    const months = monthsInDb()

    await addHere(session, months.at(-1)!)
    await vi.waitFor(() => expect(session.getState().held!.revision).not.toBeNull())
    sent.length = 0
    await session.view(months[0]!)

    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((path) => path === '/transactions/months')).toBe(true)
    expect(idsHeld(session, months[0]!)).toEqual(idsInDb(months[0]!))
  })

  it('is read together with everything else when another request wrote between the two bumps of a row written to a held month', async () => {
    const session = await opened()
    const months = monthsInDb()
    let elsewhere = 0
    during = async () => {
      elsewhere = await addElsewhere(months.at(-1)!)
    }

    await addHere(session, months.at(-1)!)
    during = undefined
    await new Promise((resolve) => setTimeout(resolve, 100))
    sent.length = 0
    await session.view(months[0]!)

    expect(sent).toContain('/reference')
    expect(idsHeld(session, months.at(-1)!)).toContain(elsewhere)
    expect(idsHeld(session, months.at(-1)!)).toEqual(idsInDb(months.at(-1)!))
  })

  it('is read together with everything else when another request wrote between the two bumps of the write', async () => {
    const session = await opened()
    const oldest = monthsInDb()[0]!
    let elsewhere = 0
    during = async () => {
      elsewhere = await addElsewhere(oldest)
    }

    await saveSettings(session)
    during = undefined
    sent.length = 0
    await session.view(oldest)

    expect(sent).toContain('/reference')
    expect(idsHeld(session, oldest)).toContain(elsewhere)
    expect(idsHeld(session, oldest)).toEqual(idsInDb(oldest))
  })

  it('is read together with everything else when another request wrote after the write, which the browser was not told of', async () => {
    const session = await opened()
    const oldest = monthsInDb()[0]!

    await saveSettings(session)
    const elsewhere = await addElsewhere(oldest)
    sent.length = 0
    await session.view(oldest)

    expect(sent).toContain('/reference')
    expect(idsHeld(session, oldest)).toContain(elsewhere)
    expect(idsHeld(session, oldest)).toEqual(idsInDb(oldest))
  })

  it('is read together with everything else when another request wrote before the write and after the ledger was read', async () => {
    const session = await opened()
    const oldest = monthsInDb()[0]!
    const elsewhere = await addElsewhere(oldest)

    await saveSettings(session)
    sent.length = 0
    await session.view(oldest)

    expect(sent).toContain('/reference')
    expect(idsHeld(session, oldest)).toContain(elsewhere)
  })
})
