// @vitest-environment node
/**
 * What follows rows across months, read from a window: the Flagged card, expense reports, past reports,
 * reimbursement links and drafts, instalment plans and the portfolio return. A window holds only the rows of a few
 * months, so these readings are right only if every row they follow is pinned (`isPinned`) and so held whatever its
 * age. The session reads a ledger through the real routes, the auth middleware and the D1 adapter's SQL on SQLite
 * with the real migrations, is moved from month to month with only a few months allowed to stay held, and the model
 * the app builds from what it holds is read the way the screens read it. Every reading must equal the one over the
 * model of the whole dataset (`GET /api/expenses`), on a synthetic ledger, the adversarial one and random ones.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { type HeldLedger, ledgerOfHeld, receiptsToRead } from '../../../src/data/ledgerHold'
import { LedgerSession } from '../../../src/data/ledgerSession'
import {
  buildExpenseReport,
  buildFlagGroup,
  buildReimbursementLinks,
  buildReimbursementDraft,
  buildSettledReport,
  forecastPaidCount,
  groupTransactionsByFlag,
  listPastReports,
  pastReportDrifted,
  receiptsOnlyReport,
  reportReceipts,
  summarizeFlagGroups,
} from '../../../src/domain/engine'
import { sortedMonths } from '../../../src/domain/engine/dates'
import type { BulkTransactionPatch } from '../../../src/domain/data/dataSource'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, settlementPaymentIds } from '../../../src/domain/ledger'
import type { ExpenseDataset, TransactionAttachment } from '../../../src/domain/types'
import { adversarialLedger } from '../../../src/testing/adversarialLedger'
import { linkedOutputs } from '../../../src/testing/rowOutputs'
import { type Context, plain } from '../../../src/testing/outputContext'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { buildExpenseModel } from '../../../src/ui/buildExpenseModel'
import { buildLedgerModel } from '../../../src/ui/buildLedgerModel'
import { patchAfterBulkUpdate } from '../../../src/ui/datasetPatches'
import type { ExpenseModel } from '../../../src/ui/useExpenseData'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getAttachments } from './attachments/index'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getReference } from './reference'
import { onRequestPatch as patchBulk } from './transactions/bulk'
import { onRequestGet as getMonths } from './transactions/months'

const SLOW = 180_000
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
/** Few enough that the session lets go of months it has read when the screen moves on. */
const HELD_MONTHS = 13

interface Served {
  name: string
  world: World
  /** What GET /api/expenses serves. */
  dataset: ExpenseDataset
}

/** Routes the browser's requests to the handlers, the way Pages does. */
function routeFetch(world: World) {
  const handlers: Array<[string, string, Handler]> = [
    ['/api/expenses/transactions/months', 'GET', getMonths],
    ['/api/expenses/reference', 'GET', getReference],
    ['/api/expenses/cube', 'GET', getCube],
    ['/api/expenses/attachments', 'GET', getAttachments],
    ['/api/expenses/transactions/bulk', 'PATCH', patchBulk],
  ]
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const method = init?.method ?? 'GET'
    const handler = handlers.find(([path, verb]) => path === url.pathname && verb === method)?.[2]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    return world.call(handler, { method, path: `${url.pathname.slice('/api/expenses'.length)}${url.search}`, ...(body ? { body } : {}) })
  }
}

/** A receipt on every third row that a past or open claim is made of, so that the reports have some to count. */
function withReceipts(ds: ExpenseDataset): ExpenseDataset {
  const payments = new Set(ds.transactions.filter((t) => t.settledBy != null).map((t) => t.settledBy))
  let next = Math.max(0, ...ds.attachments.map((a) => a.id)) + 1
  const extra: TransactionAttachment[] = ds.transactions
    .filter((t) => (t.flagId != null || t.settledBy != null || payments.has(t.id) || (t.reportCount ?? 0) > 0) && t.id % 3 === 0)
    .filter((t) => !ds.attachments.some((a) => a.transactionId === t.id))
    .map((t) => ({ id: next++, transactionId: t.id, contentType: 'image/jpeg', byteSize: 90_000, createdAt: `${t.date}T11:00:00Z`, hasThumb: true }))
  return { ...ds, attachments: [...ds.attachments, ...extra].sort((a, b) => a.transactionId - b.transactionId || a.id - b.id) }
}

/** A row without some of its optional fields, as the generators leave them out rather than set them to nothing. */
function without<T extends object>(row: T, keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key))) as T
}

/**
 * Two old payments, which no month held as rows covers: one legacy, recorded before the covered count was kept, so that
 * only the rows it settled point at it, and one orphan, whose rows were unsettled since, so that only its count of
 * covered rows marks it. A payment in the newest months is held whatever its pinning says, so these are the ones that
 * need it.
 */
function withOldPayments(ds: ExpenseDataset): ExpenseDataset {
  const plainRows = ds.transactions.filter(
    (t) => t.type === 'expense' && !t.cancelled && t.planId == null && t.flagId == null && t.settledBy == null && (t.reportCount ?? 0) === 0,
  )
  const months = sortedMonths(plainRows.map((t) => t.budgetMonth))
  const oldest = months[0]
  const middle = months[Math.floor(months.length / 2)]
  const covered = plainRows.filter((t) => t.budgetMonth === oldest).slice(0, 2)
  if (oldest === undefined || middle === undefined || covered.length < 2) return ds
  const base = covered[0]!
  const nextId = Math.max(...ds.transactions.map((t) => t.id)) + 1
  const total = covered.reduce((sum, t) => sum + t.amountCents, 0)
  const payment = (id: number, month: string, extra: { reportCount?: number; reportCoveredCents?: number }) => {
    const row = without(base, ['flagId', 'settledBy', 'planId', 'installmentIndex', 'reportCount', 'reportCoveredCents'])
    return { ...row, id, date: `${month}-27`, budgetMonth: month, description: 'Reimbursement', type: 'refund' as const, amountCents: total, labelIds: [], ...extra }
  }
  const legacy = payment(nextId, oldest, {})
  const orphan = payment(nextId + 1, middle, { reportCount: 2, reportCoveredCents: total })
  const settled = ds.transactions.map((t) => {
    if (!covered.some((c) => c.id === t.id)) return t
    return { ...without(t, ['flagId']), settledBy: legacy.id }
  })
  return { ...ds, transactions: [...settled, legacy, orphan] }
}

/**
 * Links that point at nothing: an old row settled by a payment that is gone, and one flagged with a flag that is gone,
 * as a delete in another tab leaves them until the dataset is read again. The server pins a row by the link, not by
 * what it points at, and the readings have to cope with both lists the same.
 */
function withDanglingLinks(ds: ExpenseDataset): ExpenseDataset {
  const plainRows = ds.transactions.filter(
    (t) => t.type === 'expense' && !t.cancelled && t.planId == null && t.flagId == null && t.settledBy == null && (t.reportCount ?? 0) === 0,
  )
  const oldest = sortedMonths(plainRows.map((t) => t.budgetMonth))[0]
  const [settled, flagged] = plainRows.filter((t) => t.budgetMonth === oldest)
  if (!settled || !flagged) return ds
  const gone = Math.max(...ds.transactions.map((t) => t.id)) + 1_000
  return {
    ...ds,
    transactions: ds.transactions.map((t) => {
      if (t.id === settled.id) return { ...t, settledBy: gone }
      if (t.id === flagged.id) return { ...t, flagId: 9_999 }
      return t
    }),
  }
}

async function serve(name: string, source: ExpenseDataset): Promise<Served> {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, withReceipts(withDanglingLinks(withOldPayments(source))))
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
  return { name, world, dataset }
}

const cases: Served[] = []

const sources = (randoms: number): Array<[string, ExpenseDataset]> => [
  ['synthetic', syntheticLedger({ months: 36, perMonth: 40, seed: 3 })],
  ['adversarial', adversarialLedger()],
  ...Array.from({ length: randoms }, (_, seed): [string, ExpenseDataset] => [`random ${seed}`, randomLedger(seed)]),
]

beforeAll(async () => {
  // Before any plan falls due, so that reading never inserts an instalment and the ledgers stay what their generators made.
  pinClock('2020-01-15')
  for (const [name, source] of sources(10)) cases.push(await serve(name, source))
}, SLOW)

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The model the app builds from what the session holds, with the receipts of every pinned row that has any read. */
async function windowedModel(session: LedgerSession): Promise<{ model: ExpenseModel; held: HeldLedger }> {
  const pinned = new Set(session.getState().held!.pinned.map((row) => row.id))
  const wanted = Object.keys(session.getState().held!.attachmentCounts).map(Number).filter((id) => pinned.has(id))
  session.loadReceipts(wanted)
  await vi.waitFor(() => expect(receiptsToRead(session.getState().held!, wanted)).toEqual([]))
  const held = session.getState().held!
  return { model: buildLedgerModel(ledgerOfHeld(held), { attachmentCounts: held.attachmentCounts }), held }
}

/** What the screens that follow rows across months show, as values that can be compared. */
function readings(model: ExpenseModel, viewed: string): Record<string, unknown> {
  const { transactions: tx, flags, accounts, attachments, installmentPlans, settings } = model.dataset
  const out: Record<string, unknown> = {}
  const linked = linkedOutputs({ ds: model.dataset, real: tx, viewed } as unknown as Context)
  for (const [key, read] of Object.entries(linked)) out[key] = plain(read())

  const groups = groupTransactionsByFlag(tx, flags)
  out.flaggedSummary = summarizeFlagGroups(groups)
  out.drafts = plain(groups.map((g) => buildReimbursementDraft(g, accounts, settings.defaultAccountId ?? accounts[0]?.id ?? 0)))
  // An archived flag builds a report too, and so does one with no flagged row left (null).
  for (const flag of flags) {
    out[`group ${flag.id}`] = plain(buildFlagGroup(flag.id, tx, flags))
    const report = buildExpenseReport(flag.id, tx, flags, attachments)
    out[`report ${flag.id}`] = plain(report)
    if (report) {
      out[`receipts ${flag.id}`] = plain(reportReceipts(report))
      out[`receiptsOnly ${flag.id}`] = plain(receiptsOnlyReport(report))
    }
  }
  const payments = [...new Set(tx.filter((t) => t.settledBy != null).map((t) => t.settledBy as number))].sort((a, b) => a - b)
  for (const id of payments) {
    out[`settled ${id}`] = plain(buildSettledReport(id, tx, flags, attachments))
    out[`drifted ${id}`] = pastReportDrifted(id, tx)
  }
  out.pastReports = plain(listPastReports(tx, flags))
  const links = buildReimbursementLinks(tx)
  out.settlementFor = tx.filter((t) => t.settledBy != null).map((t) => [t.id, links.settlementFor(t.id)?.id])
  out.forecast = installmentPlans.map((plan) => forecastPaidCount(plan, tx))
  return out
}

/** How many of each kind of pinned row lie in months the session does not hold as rows. */
function pinnedOutsideWindow(held: HeldLedger) {
  const months = new Set(held.rows.keys())
  const payments = new Set(held.pinned.filter((t) => t.settledBy != null).map((t) => t.settledBy))
  const outside = held.pinned.filter((t) => !months.has(t.budgetMonth))
  const count = (keep: (t: (typeof outside)[number]) => boolean) => outside.filter(keep).length
  return {
    flagged: count((t) => t.flagId != null),
    covered: count((t) => t.settledBy != null),
    payments: count((t) => payments.has(t.id)),
    reports: count((t) => (t.reportCount ?? 0) > 0),
    planRows: count((t) => t.planId != null),
    investments: count((t) => t.type === 'investment'),
  }
}

describe('what follows rows across months, read from a window over the real routes', () => {
  it('equals the readings over the whole dataset, whichever month the screen is on and whichever months were let go', async () => {
    const seen = { flagged: 0, covered: 0, payments: 0, reports: 0, planRows: 0, investments: 0, compared: 0, withReports: 0, withGroups: 0, withReceipts: 0 }
    for (const c of cases) {
      vi.stubGlobal('fetch', routeFetch(c.world))
      const whole = buildExpenseModel(c.dataset)
      const months = sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth))
      const viewed = [months.at(-1)!, months[0]!, months[Math.floor(months.length / 2)]!, '2031-01', months.at(-1)!]
      const session = new LedgerSession(apiLedgerParts, { policy: WINDOWED, maxHeldMonths: HELD_MONTHS })
      await session.open(viewed[0])
      for (const month of viewed) {
        await session.view(month)
        const { model, held } = await windowedModel(session)
        const label = `${c.name} viewed ${month}`
        const expected = readings(whole, month)
        const actual = readings(model, month)
        expect(Object.keys(actual).sort(), label).toEqual(Object.keys(expected).sort())
        for (const key of Object.keys(expected)) expect(actual[key], `${label} ${key}`).toEqual(expected[key])
        seen.compared += 1
        if (Object.keys(expected).some((key) => key.startsWith('report ') && expected[key] !== null)) seen.withReports += 1
        if ((expected.flaggedSummary as { count: number }).count > 0) seen.withGroups += 1
        if (Object.keys(expected).some((key) => key.startsWith('receipts ') && (expected[key] as unknown[]).length > 0)) seen.withReceipts += 1
        if (month === months[0] || month === months.at(-1)) {
          for (const [kind, n] of Object.entries(pinnedOutsideWindow(held))) seen[kind as keyof typeof seen] += n
        }
      }
    }
    // The test has teeth: pinned rows of every kind did lie in months that were not held, and the readings were not empty.
    expect(seen.flagged).toBeGreaterThan(20)
    expect(seen.covered).toBeGreaterThan(20)
    expect(seen.payments).toBeGreaterThan(5)
    expect(seen.reports).toBeGreaterThan(5)
    expect(seen.planRows).toBeGreaterThan(5)
    expect(seen.investments).toBeGreaterThan(20)
    expect(seen.withReports).toBeGreaterThan(20)
    expect(seen.withGroups).toBeGreaterThan(20)
    expect(seen.withReceipts).toBeGreaterThan(10)
    expect(seen.compared).toBe(cases.length * 5)
  }, SLOW)
})

describe('a write that changes which rows are pinned', () => {
  it('leaves the readings equal to the whole dataset after each write and after the months it was made in are let go', async () => {
    const seen = { checked: 0, letGo: 0, steps: new Set<string>() }
    for (const [name, source] of sources(3)) {
      const c = await serve(name, source)
      vi.stubGlobal('fetch', routeFetch(c.world))
      const months = sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth))
      const newest = months.at(-1)!
      const oldest = months[0]!
      const flag = c.dataset.flags[0]
      const payment = [...settlementPaymentIds(c.dataset.transactions)][0]
      if (!flag || payment === undefined) continue
      const session = new LedgerSession(apiLedgerParts, { policy: WINDOWED, maxHeldMonths: HELD_MONTHS })
      await session.open(newest)

      const held = () => session.getState().held!
      /** Rows held as rows that nothing pins now, oldest month first: a window always holds the newest months, so the old ones are the ones that get let go. */
      const plainRows = (fromOldest: boolean) =>
        [...held().rows.values()]
          .flat()
          .filter((t) => t.type === 'expense' && t.flagId == null && t.settledBy == null && t.planId == null && !t.cancelled && !(t.reportCount ?? 0))
          .sort((a, b) => (fromOldest ? 1 : -1) * (a.budgetMonth.localeCompare(b.budgetMonth) || a.id - b.id))
          .map((t) => t.id)
      const unheldPinned = (keep: (t: { flagId?: number | undefined }) => boolean) => {
        const months = new Set(held().rows.keys())
        return held().pinned.filter((t) => !months.has(t.budgetMonth) && keep(t)).map((t) => t.id)
      }
      const write = async (ids: number[], patch: BulkTransactionPatch) => {
        const result = await apiDataSource.updateTransactions!(ids, patch)
        expect(result.updated, `${name} ${JSON.stringify(patch)}`).toBe(ids.length)
        session.patch((d) => patchAfterBulkUpdate(d, result.transactions), { ids, patch })
      }
      const same = async (step: string, viewed: string, settles = false) => {
        const whole = buildExpenseModel((await (await c.world.call(getDataset)).json()) as ExpenseDataset)
        const compare = async () => {
          const { model } = await windowedModel(session)
          expect(readings(model, viewed), `${name} ${step}`).toEqual(readings(whole, viewed))
        }
        // At once, with no read in between: every row these writes name is held (pinned, or in a month held), so the
        // patch alone has to show them. A settlement also changes the figures of the payment it names, which the patch
        // cannot show, so the session reads the ledger again (`cascadeOf`) and the readings are given until it has.
        if (settles) await vi.waitFor(compare, { timeout: 10_000 })
        else await compare()
        seen.checked += 1
        seen.steps.add(step)
      }

      const recent = plainRows(false).slice(0, 3)
      expect(recent.length, name).toBeGreaterThan(0)
      await write(recent, { flagId: flag.id })
      await same('flagged three rows of the newest months', newest)

      await session.view(oldest)
      await same('looked at the oldest month', oldest)
      const old = plainRows(true)
      const [flagged, settled, invested] = [old.slice(0, 2), old.slice(2, 4), old.slice(4, 6)]
      if (flagged.length > 0) {
        await write(flagged, { flagId: flag.id })
        await same('flagged two rows of the oldest months', oldest)
      }
      if (settled.length > 0) {
        await write(settled, { settledBy: payment })
        await same('settled two rows of the oldest months', oldest, true)
      }
      if (invested.length > 0) {
        await write(invested, { type: 'investment' })
        await same('turned two rows of the oldest months into investments', oldest)
      }

      await session.view(newest)
      const touched = [...flagged, ...settled, ...invested]
      const rowsHeld = new Set(held().rows.keys())
      const letGo = touched.filter((id) => !rowsHeld.has(held().pinned.find((t) => t.id === id)!.budgetMonth))
      expect(letGo.length === 0 || letGo.length === touched.length, name).toBe(true)
      if (months.length > 2 * HELD_MONTHS) expect(letGo.length, `${name}: the months of the written rows are let go`).toBe(touched.length)
      seen.letGo += letGo.length
      await same('looked at the newest month, so the written rows lost their months', newest, true)

      if (flagged.length > 0) {
        await write(flagged, { flagId: null })
        await same('cleared the flag of rows in months not held', newest)
      }
      if (settled.length > 0) {
        await write(settled, { settledBy: null })
        await same('un-settled rows in months not held', newest, true)
      }
      if (invested.length > 0) {
        await write(invested, { type: 'expense' })
        await same('turned investments in months not held back into expenses', newest)
      }
      const oldFlagged = unheldPinned((t) => t.flagId != null).slice(0, 2)
      if (oldFlagged.length > 0) {
        const category = c.dataset.categories.find((x) => x.id !== c.dataset.transactions.find((t) => t.id === oldFlagged[0])?.categoryId)!
        await write(oldFlagged, { categoryId: category.id })
        await same('moved flagged rows in months not held to another category', newest)
        await write(oldFlagged, { flagId: null })
        await same('cleared their flags', newest)
      }
      await write(recent, { flagId: null })
      await same('cleared the flag of the three newest rows', newest)
    }
    expect(seen.checked).toBeGreaterThan(30)
    expect(seen.letGo).toBeGreaterThan(10)
    // Every kind of step ran for some ledger.
    expect(seen.steps.size).toBe(12)
  }, SLOW)
})
