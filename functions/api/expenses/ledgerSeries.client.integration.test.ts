// @vitest-environment node
/**
 * A windowed model with the series the server serves, held to the model of every row. The browser reads the
 * ledger through `apiDataSource` and the real routes (auth middleware, the D1 adapter's SQL on SQLite with
 * the real migrations), holds a window of 13 months and asks for the series like a screen that reads them,
 * and the readings the Overview, Spending and the Upcoming card make of that model are compared with the
 * same readings of the model `GET /api/expenses` makes. The series are only worth having if those agree.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { ledgerOfHeld } from '../../../src/data/ledgerHold'
import { LedgerSession } from '../../../src/data/ledgerSession'
import { sortedMonths } from '../../../src/domain/engine/dates'
import { seriesFromTransactions } from '../../../src/domain/engine/recurringSeries'
import { detectUpcoming } from '../../../src/domain/engine/recurringUpcoming'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../../../src/domain/ledger'
import type { ExpenseDataset, Transaction } from '../../../src/domain/types'
import { adversarialLedger } from '../../../src/testing/adversarialLedger'
import { LATER, openAt, plain } from '../../../src/testing/outputContext'
import { randomLedger } from '../../../src/testing/randomLedger'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { CAT, CHECKING } from '../../../src/testing/syntheticReference'
import { buildOverviewData } from '../../../src/ui/analytics/overview/overviewModel'
import { spendingDetail, spendingRows } from '../../../src/ui/analytics/spending/spendingModel'
import { patchAfterTransactionCreate } from '../../../src/ui/datasetPatches'
import { buildExpenseModel } from '../../../src/ui/buildExpenseModel'
import { buildLedgerModel, withHistory } from '../../../src/ui/buildLedgerModel'
import { upcomingOf } from '../../../src/ui/tabs/useUpcoming'
import type { ExpenseModel } from '../../../src/ui/useExpenseData'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestGet as getDataset } from './index'
import { onRequestGet as getReference } from './reference'
import { onRequestGet as getSeries } from './series'
import { onRequestGet as getMonths } from './transactions/months'

const SLOW = 180_000
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const GROUPS = ['category', 'fixedFlexible', 'label', 'description'] as const
const PERIODS = [
  ['month', 'prevMonth'],
  ['ytd', 'avg3'],
  ['last12', 'prevYear'],
] as const

interface Served {
  name: string
  world: World
  /** What GET /api/expenses serves. */
  dataset: ExpenseDataset
}

function routeFetch(world: World, seen: string[] = []) {
  const handlers: Array<[string, Handler]> = [
    ['/api/expenses/transactions/months', getMonths],
    ['/api/expenses/reference', getReference],
    ['/api/expenses/cube', getCube],
    ['/api/expenses/series', getSeries],
  ]
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    seen.push(url.pathname)
    const handler = handlers.find(([path]) => path === url.pathname)?.[1]
    if (!handler) return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    return world.call(handler, { path: `${url.pathname.slice('/api/expenses'.length)}${url.search}` })
  }
}

async function serve(name: string, source: ExpenseDataset): Promise<Served> {
  const sqlite = migratedDatabase()
  sqlite.exec('PRAGMA foreign_keys = OFF')
  seedDataset(sqlite, OWNER, source)
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  const dataset = (await (await world.call(getDataset)).json()) as ExpenseDataset
  return { name, world, dataset }
}

/**
 * A cleaner who came at odd intervals for two years and then monthly on the 3rd for the last twelve months
 * before the ledger ends. Its recent rows alone look like a monthly charge due on the 3rd; with its history
 * it is not regular enough to be one. Only a client that holds the whole series can tell.
 */
function withIrregularPast(base: ExpenseDataset): ExpenseDataset {
  const months = sortedMonths(base.transactions.map((t) => t.budgetMonth))
  const last = months.at(-1)!
  const [year, month] = last.split('-').map(Number) as [number, number]
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const at = new Date(Date.UTC(year, month - 1 - 12 + i, 3))
    return at.toISOString().slice(0, 10)
  })
  const gaps = [3, 61, 8, 75, 12, 48, 15, 90, 18, 55, 10, 66, 20, 120]
  const dates: string[] = []
  let cursor = new Date(`${monthly[0]}T00:00:00Z`)
  for (const gap of gaps) {
    cursor = new Date(cursor.getTime() - gap * 86_400_000)
    dates.push(cursor.toISOString().slice(0, 10))
  }
  const firstId = Math.max(...base.transactions.map((t) => t.id)) + 1
  const rows: Transaction[] = [...dates, ...monthly].map((date, i) => ({
    id: firstId + i,
    date,
    budgetMonth: date.slice(0, 7),
    description: 'Cleaner',
    accountId: CHECKING,
    categoryId: CAT.other,
    type: 'expense',
    amountCents: 6_500,
    cancelled: false,
    status: 'posted',
    labelIds: [],
  }))
  return {
    ...base,
    transactions: [...base.transactions, ...rows].sort((a, b) =>
      a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
    ),
  }
}

/** The first few random ledgers that are longer than a window, since a shorter one is held in full. */
function randomWindowed(count: number): Array<[string, ExpenseDataset]> {
  const longEnough = (ds: ExpenseDataset) => new Set(ds.transactions.map((t) => t.budgetMonth)).size > HYDRATED_DATA_MONTHS + 1
  const found: Array<[string, ExpenseDataset]> = []
  for (let seed = 0; found.length < count && seed < 100; seed++) {
    const ledger = randomLedger(seed)
    if (longEnough(ledger)) found.push([`random ${seed}`, ledger])
  }
  return found
}

const cases: Served[] = []

beforeAll(async () => {
  pinClock('2020-01-15')
  const sources: Array<[string, ExpenseDataset]> = [
    ['synthetic', syntheticLedger({ months: 36, perMonth: 30, seed: 3 })],
    ['adversarial', adversarialLedger()],
    ['irregular past', withIrregularPast(syntheticLedger({ months: 36, perMonth: 20, seed: 5 }))],
    ...randomWindowed(3),
  ]
  for (const [name, source] of sources) cases.push(await serve(name, source))
}, SLOW)

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The model a browser builds over the routes with a window around `month`, and the series it was given. */
async function windowedModel(c: Served, month: string, withSeries: boolean, seen: string[] = []) {
  vi.stubGlobal('fetch', routeFetch(c.world, seen))
  const session = new LedgerSession(apiDataSource as Required<typeof apiDataSource>, { policy: WINDOWED })
  await session.open(month)
  const stop = session.watchSeries()
  await vi.waitFor(() => expect(session.getState().series, String(session.getState().error)).not.toBeNull())
  const { held, series } = session.getState()
  const built = buildLedgerModel(ledgerOfHeld(held!), { attachmentCounts: held!.attachmentCounts })
  const model = withSeries ? withHistory(built, series!) : built
  return { model, series: series!, windowed: held!.cells !== null, session, stop }
}

/** The model the screens have after a write: the rows as they are now, with the series as they were read. */
function modelAfterWrite(session: LedgerSession): ExpenseModel {
  const { held, series } = session.getState()
  return withHistory(buildLedgerModel(ledgerOfHeld(held!), { attachmentCounts: held!.attachmentCounts }), series!)
}

/** What the Overview and the Spending view show of a model for a viewed month, as strings that can be compared. */
function readings(model: ExpenseModel, month: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [mode, clock] of [['closed', LATER], ['open', openAt(month)]] as const) {
    for (const basis of ['committed', 'paid'] as const) {
      for (const [period, compare] of PERIODS) {
        const data = buildOverviewData(model, { month, period, compare, basis, ...clock })
        out[`overview:${mode}:${basis}:${period}`] = JSON.stringify(plain(data))
      }
    }
    for (const groupBy of GROUPS) {
      const query = { month, basis: 'committed' as const, groupBy, ...clock }
      const rows = spendingRows(model, query)
      out[`spending:${mode}:${groupBy}`] = JSON.stringify(plain(rows))
      if (rows[0]) {
        const detail = spendingDetail(model, { ...query, months: model.months, key: rows[0].key })
        out[`detail:${mode}:${groupBy}`] = JSON.stringify(plain(detail))
      }
    }
  }
  return out
}

/** The days around the end of the ledger, which is when a charge is due that the ledger's last row leads up to. */
function todays(model: ExpenseModel): string[] {
  const last = model.months.at(-1)!
  const days = ['01', '02', '03', '04', '10', '20', '28']
  return days.map((day) => `${last}-${day}`)
}

const differing = (a: Record<string, string>, b: Record<string, string>): string[] =>
  Object.keys(a).filter((key) => a[key] !== b[key])

const upcomingNames = (model: ExpenseModel, today: string): string =>
  JSON.stringify(
    upcomingOf(model.dataset.transactions, model.history, today, {}).map((s) => [s.description, s.predictedDate]),
  )

describe('the series the routes serve', () => {
  it('are the series of every row of the dataset, newest first', async () => {
    for (const c of cases) {
      const { series, windowed } = await windowedModel(c, sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth)).at(-1)!, true)
      expect(windowed, c.name).toBe(true)
      expect(series, c.name).toEqual(seriesFromTransactions(c.dataset.transactions))
    }
  }, SLOW)
})

describe('a windowed model with the served series', () => {
  it('reads the Overview and Spending as the model of every row does, from the first month to the last', async () => {
    for (const c of cases) {
      const whole = buildExpenseModel(c.dataset)
      const months = sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth))
      for (const month of [months[0]!, months[Math.floor(months.length / 2)]!, months.at(-1)!]) {
        const { model } = await windowedModel(c, month, true)
        expect(differing(readings(whole, month), readings(model, month)), `${c.name} ${month}`).toEqual([])
      }
    }
  }, SLOW)

  it('offers the charges the model of every row offers, on the days around the end of the ledger', async () => {
    let offered = 0
    for (const c of cases) {
      const whole = buildExpenseModel(c.dataset)
      const { model } = await windowedModel(c, whole.months.at(-1)!, true)
      for (const today of todays(whole)) {
        const expected = upcomingNames(whole, today)
        expect(upcomingNames(model, today), `${c.name} ${today}`).toBe(expected)
        offered += (JSON.parse(expected) as unknown[]).length
        const first = detectUpcoming(whole.dataset.transactions, { today })[0]
        if (!first) continue
        const stopped = { [first.seriesKey]: { after: first.lastChargeDate } }
        expect(
          upcomingOf(model.dataset.transactions, model.history, today, stopped),
          `${c.name} ${today} stopped`,
        ).toEqual(upcomingOf(whole.dataset.transactions, undefined, today, stopped))
      }
    }
    expect(offered).toBeGreaterThan(0)
  }, SLOW)
})

describe('the same model without the served series', () => {
  it('reads the Overview and Spending differently, so the comparison above has teeth', async () => {
    let broken = 0
    for (const c of cases) {
      const whole = buildExpenseModel(c.dataset)
      const month = whole.months.at(-1)!
      const { model } = await windowedModel(c, month, false)
      broken += differing(readings(whole, month), readings(model, month)).length
    }
    expect(broken).toBeGreaterThan(0)
  }, SLOW)

  it('offers a charge the whole history says is not regular enough, which is why the card waits for the series', async () => {
    const c = cases.find((x) => x.name === 'irregular past')!
    const whole = buildExpenseModel(c.dataset)
    const { model } = await windowedModel(c, whole.months.at(-1)!, false)
    const days = todays(whole)
    const wrong = days.filter((today) => upcomingNames(model, today) !== upcomingNames(whole, today))
    expect(wrong.length).toBeGreaterThan(0)
    expect(days.map((today) => upcomingNames(whole, today)).join()).not.toContain('Cleaner')
    expect(wrong.map((today) => upcomingNames(model, today)).join()).toContain('Cleaner')
  }, SLOW)
})

describe('a windowed model after a write, with the series as they were read', () => {
  it('stops offering a charge once it is logged, as the model of every row does, without reading the series again', async () => {
    let logged = 0
    for (const c of cases) {
      const months = sortedMonths(c.dataset.transactions.map((t) => t.budgetMonth))
      const seen: string[] = []
      const { session, stop } = await windowedModel(c, months.at(-1)!, true, seen)
      const whole = buildExpenseModel(c.dataset)
      const day = todays(whole).find((today) => detectUpcoming(whole.dataset.transactions, { today }).length > 0)
      if (!day) continue
      const due = detectUpcoming(whole.dataset.transactions, { today: day })[0]!
      const row: Transaction = {
        id: Math.max(...c.dataset.transactions.map((t) => t.id)) + 1,
        date: due.predictedDate,
        budgetMonth: due.predictedBudgetMonth,
        description: due.description,
        accountId: due.accountId,
        categoryId: due.categoryId,
        type: due.type,
        amountCents: due.amountCents,
        cancelled: false,
        status: 'posted',
        labelIds: [],
      }
      expect(upcomingNames(modelAfterWrite(session), day), c.name).toContain(due.description)
      session.patch((d) => patchAfterTransactionCreate(d, row))
      const model = modelAfterWrite(session)
      const written = buildExpenseModel({ ...c.dataset, transactions: [row, ...c.dataset.transactions] })
      for (const today of todays(whole)) {
        expect(upcomingNames(model, today), `${c.name} ${today}`).toBe(upcomingNames(written, today))
      }
      expect(upcomingNames(model, day), c.name).not.toContain(due.description)
      expect(seen.filter((path) => path.endsWith('/series')), c.name).toHaveLength(1)
      logged += 1
      stop()
    }
    expect(logged).toBeGreaterThan(0)
  }, SLOW)
})
