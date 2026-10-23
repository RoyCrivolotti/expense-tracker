// @vitest-environment node
/**
 * The three ledger part routes (and the receipt list) through the real auth middleware and the D1
 * adapter's SQL on SQLite with the real migrations: what each answers, how it answers a conditional
 * request, that all three carry the one revision, what they refuse, and that one owner never sees or
 * matches another's.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CubePart,
  MAX_CUBE_CELLS,
  MAX_CUBE_MONTHS,
  MAX_ROWS_MONTHS,
  MAX_ROWS_PER_REQUEST,
  type MonthRowsPart,
  type ReferencePart,
} from '../../../src/domain/data/ledgerParts'
import { buildCells, partitionPinned } from '../../../src/domain/ledger'
import { shiftBudgetMonth } from '../../../src/domain/engine'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { OTHER, OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { expense, seedLedger, uploadForm, type SeededIds } from '../../_shared/testing/seedLedger'
import { onRequestPost as postTransaction } from './transactions/index'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPost as postAttachment } from './attachments/index'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getReference } from './reference'
import { onRequestGet as getMonths } from './transactions/months'

let sqlite: DatabaseSync
let world: World
let ids: SeededIds

const ROUTES: Array<[string, Handler, string]> = [
  ['reference', getReference, '/reference'],
  ['months', getMonths, '/transactions/months?from=2026-01&to=2026-12'],
  ['cube', getCube, '/cube?from=2026-01&to=2026-12'],
]

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

async function get(handler: Handler, path: string, headers?: Record<string, string>, email?: string) {
  const response = await world.call(handler, { path, ...(headers ? { headers } : {}), ...(email ? { email } : {}) })
  return { response, etag: response.headers.get('etag'), text: await response.text() }
}

const body = (text: string) => JSON.parse(text) as Record<string, unknown> & { revision: string }
const referenceOf = (text: string) => JSON.parse(text) as ReferencePart
const rowsOf = (text: string) => JSON.parse(text) as MonthRowsPart
const cubeOf = (text: string) => JSON.parse(text) as CubePart

async function addRow(over: Record<string, unknown>) {
  const response = await world.call(postTransaction, {
    method: 'POST',
    path: '/transactions',
    body: { ...expense(ids.debit, ids.groceries, 'Row', '2026-10-09'), ...over },
  })
  expect(response.status).toBe(201)
  return (await response.json<{ id: number }>()).id
}

/** Rows written straight to the table, for the bounds, which would take thousands of requests. */
function insertMany(owner: string, count: number, at: (i: number) => { month: string; account?: number; category?: number }) {
  sqlite.exec('PRAGMA foreign_keys = OFF')
  const stmt = sqlite.prepare(
    `INSERT INTO transactions (owner, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled)
     VALUES (?, ?, ?, 'Bulk', ?, ?, 'expense', 100, 0)`,
  )
  sqlite.exec('BEGIN')
  for (let i = 0; i < count; i += 1) {
    const { month, account = 1, category = 1 } = at(i)
    stmt.run(owner, `${month}-10`, month, account, category)
  }
  sqlite.exec('COMMIT')
}

describe.each(ROUTES)('GET %s', (name, handler, path) => {
  it('answers 200 with the revision in the body and a weak, scoped ETag', async () => {
    const { response, etag, text } = await get(handler, path)

    expect(response.status).toBe(200)
    expect(body(text).revision).toBe(world.token())
    expect(etag).toMatch(new RegExp(`^W/"${world.token()}-2026-10-${name}1(-\\d{4}-\\d{2}\\.\\.\\d{4}-\\d{2})?"$`))
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('answers a matching If-None-Match with 304 and an empty body, reading only the revision', async () => {
    const { etag } = await get(handler, path)
    world.clearLog()

    const { response, text } = await get(handler, path, { 'if-none-match': etag! })

    expect(response.status).toBe(304)
    expect(text).toBe('')
    expect(response.headers.get('etag')).toBe(etag)
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    const beyondAuth = world.log.filter((sql) => !/allowed_users|user_group_grants/.test(sql))
    expect(beyondAuth).toHaveLength(1)
    expect(beyondAuth[0]).toContain('owner_revision')
  })

  it('answers 200 again, with a new tag and revision, once anything is written', async () => {
    const before = await get(handler, path)
    const put = await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 777_700 } })
    expect(put.status).toBe(200)

    const after = await get(handler, path, { 'if-none-match': before.etag! })

    expect(after.response.status).toBe(200)
    expect(after.etag).not.toBe(before.etag)
    expect(body(after.text).revision).not.toBe(body(before.text).revision)
    expect(body(after.text).revision).toBe(world.token())
  })

  it('does not treat a tag held for something else as current', async () => {
    const { etag } = await get(handler, path)
    for (const stale of [etag!.replace('-2026-10-', '-2026-09-'), etag!.replace(/[0-9a-f]{16}/, 'ffffffffffffffff'), etag!.replace(/1(-[\d.-]+)?"$/, '0"'), '*']) {
      expect((await get(handler, path, { 'if-none-match': stale })).response.status).toBe(200)
    }
  })

  it('never matches the tag the other owner holds, and never answers with their data', async () => {
    const mine = await get(handler, path)
    const theirs = await get(handler, path, { 'if-none-match': mine.etag! }, OTHER)

    expect(theirs.response.status).toBe(200)
    expect(theirs.etag).not.toBe(mine.etag)
    expect(body(theirs.text).revision).toBe(world.token(OTHER))
    expect(body(theirs.text).revision).not.toBe(body(mine.text).revision)
  })

  it('is refused for someone who is not allowed in', async () => {
    const { response } = await get(handler, path, undefined, 'stranger@example.com')
    expect(response.status).toBe(403)
  })

  it('refuses a parameter it does not know', async () => {
    const separator = path.includes('?') ? '&' : '?'
    const { response } = await get(handler, `${path}${separator}owner=${OTHER}`)
    expect(response.status).toBe(400)
  })

  it('changes its tag at the turn of the month, because the installment that falls due changes the data', async () => {
    const october = await get(handler, path)
    pinClock('2026-11-02')

    const november = await get(handler, path, { 'if-none-match': october.etag! })

    expect(november.response.status).toBe(200)
    expect(november.etag).toContain('-2026-11-')
  })
})

describe('the three parts carry one revision', () => {
  it('while nothing is written, and differ from it afterwards', async () => {
    const parts = await Promise.all(ROUTES.map(([, handler, path]) => get(handler, path)))
    const revisions = parts.map((p) => body(p.text).revision)
    expect(new Set(revisions).size).toBe(1)
    expect(revisions[0]).toBe(world.token())

    await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 1 } })
    const later = await get(getMonths, ROUTES[1]![2])
    expect(body(later.text).revision).not.toBe(revisions[0])
  })
})

describe('GET /reference', () => {
  it('sends the reference tables, the pinned rows, the months with their counts and the row count', async () => {
    const investment = await addRow({ type: 'investment', description: 'Index fund', amountCents: 50_000 })
    const flagged = await addRow({ flagId: ids.flag, description: 'Work lunch' })
    const dataset = await createD1ExpenseRepository(world.env).loadDataset(OWNER)

    const { text } = await get(getReference, '/reference')
    const part = referenceOf(text)

    expect(part.reference).toEqual(JSON.parse(JSON.stringify({ ...dataset, transactions: undefined, attachments: undefined })))
    expect(part.pinned.map((t) => t.id).sort()).toEqual([investment, flagged].sort())
    expect(part.pinned.map((t) => t.id)).toEqual(partitionPinned(dataset.transactions).pinned.map((t) => t.id))
    expect(part.months).toEqual(['2026-10'])
    expect(part.rowCount).toBe(dataset.transactions.length)
    expect(part.rowsPerMonth).toEqual({ '2026-10': dataset.transactions.length })
    expect(part.attachmentCounts).toEqual({})
  })

  it('counts the receipts of a pinned row, and sends no receipt metadata', async () => {
    await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 1 } })
    const flagged = await addRow({ flagId: ids.flag, description: 'Work lunch' })
    const up = await world.call(postAttachment, { method: 'POST', path: '/attachments', rawBody: uploadForm(flagged) })
    expect(up.status).toBe(201)

    const { text } = await get(getReference, '/reference')

    const part = referenceOf(text)
    expect(part.attachmentCounts).toEqual({ [flagged]: 1 })
    expect(text).not.toContain('objectKey')
    expect(text).not.toContain('"attachments"')
  })

  it('runs the installment backfill when the copy is not current, and reports the revision after it', async () => {
    pinClock('2026-11-02')
    const before = world.token()

    const first = await get(getReference, '/reference')

    const part = referenceOf(first.text)
    const sofa = part.pinned.filter((t) => t.planId === ids.plan)
    expect(sofa).toHaveLength(1)
    expect(world.token()).not.toBe(before)
    expect(part.revision).toBe(world.token())
    expect(first.etag).toContain(world.token()!)
    // The tag already names the state the backfill left, so the next request is a 304, not a second load.
    expect((await get(getReference, '/reference', { 'if-none-match': first.etag! })).response.status).toBe(304)
  })

  it('does not run the backfill for a 304', async () => {
    const { etag } = await get(getReference, '/reference')
    pinClock('2026-10-20')
    world.clearLog()

    const { response } = await get(getReference, '/reference', { 'if-none-match': etag! })

    expect(response.status).toBe(304)
    expect(world.log.some((sql) => /installment_plans/.test(sql))).toBe(false)
  })

  it('reads on when the backfill fails, as GET /api/expenses does, and says so in the log', async () => {
    pinClock('2026-11-02')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    world.intercept((sql) => {
      if (/SELECT p\.\* FROM installment_plans/.test(sql)) throw new Error('D1 is down')
    })

    const { response, text } = await get(getReference, '/reference')

    expect(response.status).toBe(200)
    expect(referenceOf(text).pinned.filter((t) => t.planId === ids.plan)).toHaveLength(0)
    expect(logged).toHaveBeenCalledWith('installment backfill failed', expect.any(Error))
    logged.mockRestore()
  })

  it('sends only the caller’s own tables and rows', async () => {
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite.prepare("INSERT INTO accounts (owner, name, kind, settlement, active) VALUES (?, 'Their account', 'debit', 'immediate', 1)").run(OTHER)
    insertMany(OTHER, 3, () => ({ month: '2026-10' }))
    sqlite.prepare("UPDATE transactions SET type = 'investment' WHERE owner = ?").run(OTHER)

    const mine = referenceOf((await get(getReference, '/reference')).text)
    const theirs = referenceOf((await get(getReference, '/reference', undefined, OTHER)).text)

    expect(mine.reference.accounts.map((a) => a.name)).not.toContain('Their account')
    expect(mine.pinned.every((t) => t.description !== 'Bulk')).toBe(true)
    expect(mine.rowCount).toBe(3)
    expect(theirs.reference.accounts.map((a) => a.name)).toEqual(['Their account'])
    expect(theirs.pinned).toHaveLength(3)
    expect(theirs.rowCount).toBe(3)
  })
})

describe('GET /transactions/months', () => {
  const path = (from: string, to: string) => `/transactions/months?from=${from}&to=${to}`

  it('sends every row whose budget month is in the range, newest first, with the receipts of those rows', async () => {
    const dataset = await createD1ExpenseRepository(world.env).loadDataset(OWNER)
    const want = dataset.transactions.filter((t) => t.budgetMonth >= '2026-10' && t.budgetMonth <= '2026-10')

    const { text } = await get(getMonths, path('2026-10', '2026-10'))

    const part = rowsOf(text)
    expect(part.from).toBe('2026-10')
    expect(part.to).toBe('2026-10')
    expect(part.transactions.map((t) => t.id)).toEqual(want.map((t) => t.id))
    expect(part.attachmentCounts).toEqual({ [ids.transactions[0]!]: 1 })
  })

  it('sends nothing for a range with no rows, and not an error', async () => {
    const { response, text } = await get(getMonths, path('2020-01', '2020-03'))
    expect(response.status).toBe(200)
    expect(rowsOf(text).transactions).toEqual([])
  })

  it('has a tag for each range, so one range’s tag does not answer another', async () => {
    const a = await get(getMonths, path('2026-09', '2026-10'))
    const b = await get(getMonths, path('2026-08', '2026-10'))

    expect(a.etag).not.toBe(b.etag)
    expect((await get(getMonths, path('2026-08', '2026-10'), { 'if-none-match': a.etag! })).response.status).toBe(200)
    expect((await get(getMonths, path('2026-09', '2026-10'), { 'if-none-match': a.etag! })).response.status).toBe(304)
  })

  it.each([
    ['no range', '/transactions/months'],
    ['no end', '/transactions/months?from=2026-01'],
    ['no start', '/transactions/months?to=2026-01'],
    ['a blank end', '/transactions/months?from=2026-01&to='],
    ['month 13', path('2026-01', '2026-13')],
    ['month 00', path('2026-00', '2026-01')],
    ['a one digit month', path('2026-1', '2026-10')],
    ['a full date', path('2026-01-15', '2026-02-15')],
    ['padding', path('%202026-01', '2026-02')],
    ['text', path('january', 'march')],
    ['an end before the start', path('2026-05', '2026-04')],
    ['more than the month limit', path('2020-01', '2030-01')],
    ['a repeated parameter', '/transactions/months?from=2026-01&from=2026-02&to=2026-03'],
  ])('refuses %s with a 400 before reading any row', async (_label, url) => {
    world.clearLog()

    const { response, etag } = await get(getMonths, url)

    expect(response.status).toBe(400)
    expect(etag).toBeNull()
    expect(world.log.some((sql) => /FROM transactions/.test(sql))).toBe(false)
  })

  it('allows exactly the most months, and refuses one more', async () => {
    expect((await get(getMonths, path('2025-01', shiftBudgetMonth('2025-01', MAX_ROWS_MONTHS - 1)))).response.status).toBe(200)
    const { response, text } = await get(getMonths, path('2025-01', shiftBudgetMonth('2025-01', MAX_ROWS_MONTHS)))
    expect(response.status).toBe(400)
    expect(text).toContain(`at most ${MAX_ROWS_MONTHS}`)
  })

  it('allows exactly the most rows, and refuses one more, naming the limit', async () => {
    insertMany(OWNER, MAX_ROWS_PER_REQUEST - 2, () => ({ month: '2026-03' }))
    const exact = await get(getMonths, path('2026-03', '2026-03'))
    expect(exact.response.status).toBe(200)
    expect(rowsOf(exact.text).transactions).toHaveLength(MAX_ROWS_PER_REQUEST - 2)

    insertMany(OWNER, 3, () => ({ month: '2026-03' }))
    const over = await get(getMonths, path('2026-03', '2026-03'))
    expect(over.response.status).toBe(400)
    expect(over.text).toContain(String(MAX_ROWS_PER_REQUEST))
    expect(over.etag).toBeNull()
  })

  it('reads no more than the limit and one row for a range that is too big', async () => {
    insertMany(OWNER, MAX_ROWS_PER_REQUEST + 500, () => ({ month: '2026-04' }))
    world.clearLog()

    const { response } = await get(getMonths, path('2026-04', '2026-04'))

    expect(response.status).toBe(400)
    const statement = world.log.find((sql) => /ORDER BY t\.budget_month DESC/.test(sql))!
    expect(statement).toContain('LIMIT ?')
  })

  it('sends none of the other owner’s rows, whatever the range', async () => {
    insertMany(OTHER, 4, () => ({ month: '2026-10' }))

    const mine = rowsOf((await get(getMonths, path('2026-01', '2026-12'))).text)
    const theirs = rowsOf((await get(getMonths, path('2026-01', '2026-12'), undefined, OTHER)).text)

    expect(mine.transactions.every((t) => t.description !== 'Bulk')).toBe(true)
    expect(theirs.transactions).toHaveLength(4)
    expect(theirs.transactions.every((t) => t.description === 'Bulk')).toBe(true)
  })
})

describe('GET /cube', () => {
  const path = (from: string, to: string) => `/cube?from=${from}&to=${to}`

  it('sends the cells of the unpinned rows in the range, as buildCells makes them', async () => {
    await addRow({ type: 'investment', description: 'Index fund', amountCents: 50_000 })
    await addRow({ flagId: ids.flag, description: 'Work lunch' })
    await addRow({ cancelled: true, description: 'Gone', date: '2026-08-04', budgetMonth: '2026-08' })
    const dataset = await createD1ExpenseRepository(world.env).loadDataset(OWNER)

    const { text } = await get(getCube, path('2026-01', '2026-12'))

    const want = buildCells(partitionPinned(dataset.transactions).rest)
    expect(cubeOf(text).cells).toEqual(want)
    expect(want.some((c) => c.cancelled && c.budgetMonth === '2026-08')).toBe(true)
  })

  it.each([
    ['no range', '/cube'],
    ['an end before the start', path('2026-05', '2026-04')],
    ['a bad month', path('2026-01', '2026-13')],
    ['more than the month limit', path('2000-01', '2010-01')],
  ])('refuses %s with a 400', async (_label, url) => {
    expect((await get(getCube, url)).response.status).toBe(400)
  })

  it('allows exactly the most months, and refuses one more', async () => {
    expect((await get(getCube, path('2016-01', shiftBudgetMonth('2016-01', MAX_CUBE_MONTHS - 1)))).response.status).toBe(200)
    const over = await get(getCube, path('2016-01', shiftBudgetMonth('2016-01', MAX_CUBE_MONTHS)))
    expect(over.response.status).toBe(400)
    expect(over.text).toContain(`at most ${MAX_CUBE_MONTHS}`)
  })

  it('allows exactly the most cells, and refuses one more', async () => {
    const first = '2016-01'
    const last = shiftBudgetMonth(first, MAX_CUBE_MONTHS - 1)
    const month = (i: number) => shiftBudgetMonth(first, i % MAX_CUBE_MONTHS)
    insertMany(OWNER, MAX_CUBE_CELLS, (i) => ({ month: month(i), account: 100, category: 1 + Math.floor(i / MAX_CUBE_MONTHS) }))

    const exact = await get(getCube, path(first, last))
    expect(exact.response.status).toBe(200)
    expect(cubeOf(exact.text).cells).toHaveLength(MAX_CUBE_CELLS)

    insertMany(OWNER, 1, () => ({ month: first, account: 101, category: 1 }))
    const over = await get(getCube, path(first, last))
    expect(over.response.status).toBe(400)
    expect(over.text).toContain(String(MAX_CUBE_CELLS))
  })

  it('sums none of the other owner’s rows', async () => {
    insertMany(OTHER, 5, () => ({ month: '2026-10' }))

    const mine = cubeOf((await get(getCube, path('2026-10', '2026-10'))).text)
    const theirs = cubeOf((await get(getCube, path('2026-10', '2026-10'), undefined, OTHER)).text)

    expect(mine.cells.reduce((n, c) => n + c.count, 0)).toBe(3)
    expect(theirs.cells.reduce((n, c) => n + c.count, 0)).toBe(5)
  })
})
