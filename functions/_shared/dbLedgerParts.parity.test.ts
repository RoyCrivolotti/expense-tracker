// @vitest-environment node
/**
 * The ledger parts, served by the real SQL on SQLite with the real migrations, are held to the pure
 * ledger model: the pinned rows are what `partitionPinned` picks from every row, the rows of a range are
 * the dataset's rows in it, the cube of a range is what `buildCells` makes of the unpinned rows in it, and
 * the three parts put together are the ledger `buildLedger` makes from the whole dataset. The reference
 * for every row is `loadDataset`, so status and label ids come from the same place a client gets them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { classifyFixedSpend, recurringFixedGroups, shiftBudgetMonth } from '../../src/domain/engine'
import { referenceTablesOf } from '../../src/domain/data/ledgerParts'
import type { ExpenseRepository } from '../../src/domain/ports/expenseRepository'
import {
  HYDRATED_DATA_MONTHS,
  type HydrationPolicy,
  assembleRows,
  buildCells,
  buildLedger,
  hydratedMonthsFor,
  partitionPinned,
} from '../../src/domain/ledger'
import type { Ledger } from '../../src/domain/ledger'
import type { ExpenseDataset, Transaction } from '../../src/domain/types'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { LATER, differing, openAt, outputs, wholeLedger } from '../../src/testing/engineOutputs'
import { GLOBAL_DIFFERENCES } from '../../src/testing/intendedDifferences'
import { ledgerReferenceOf } from '../../src/domain/ledger/partsOfDataset'
import { randomLedger } from '../../src/testing/randomLedger'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OWNER, awkwardLedger, queryDb, withSortedLabels, type QueryDb } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { loadDataset } from './db'
import type { Env } from './env'
import { pinClock } from './testing/expenseWorld'

const SLOW = 60_000
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const EVERY_ROW = 1_000_000

interface Served {
  name: string
  kit: QueryDb
  repo: ExpenseRepository
  /** What GET /api/expenses serves, labels ascending. */
  rows: Transaction[]
  dataset: ExpenseDataset
  months: string[]
}

async function serve(name: string, source: ExpenseDataset): Promise<Served> {
  const kit = queryDb(source)
  const env: Env = { DB: kit.d1 }
  const repo = createD1ExpenseRepository(env)
  const dataset = await loadDataset(env, OWNER)
  const rows = dataset.transactions.map(withSortedLabels)
  const months = [...new Set(rows.map((t) => t.budgetMonth))].sort()
  return { name, kit, repo, rows, dataset: { ...dataset, transactions: rows }, months }
}

const inRange = (t: Transaction, from: string, to: string) => t.budgetMonth >= from && t.budgetMonth <= to

/** Single months, three month windows, the whole span, and ranges with nothing in them. */
function rangesOf(months: string[]): Array<[string, string]> {
  if (months.length === 0) return [['2026-01', '2026-03']]
  const first = months[0]!
  const last = months.at(-1)!
  const single = months.map((m): [string, string] => [m, m])
  const windows = months.map((m): [string, string] => [m, shiftBudgetMonth(m, 2)])
  return [...single, ...windows, [first, last], [shiftBudgetMonth(last, 1), shiftBudgetMonth(last, 5)], [shiftBudgetMonth(first, -9), shiftBudgetMonth(first, -1)]]
}

const cases: Served[] = []

beforeAll(async () => {
  // Before every ledger's plans fall due, so that reading one never inserts an instalment and the
  // ledgers stay what their generators made.
  pinClock('2020-01-15')
  const sources: Array<[string, ExpenseDataset]> = [
    ['synthetic', syntheticLedger({ months: 36, perMonth: 40, seed: 3 })],
    ['adversarial', adversarialLedger()],
    ['awkward', awkwardLedger()],
    ...Array.from({ length: 40 }, (_, seed): [string, ExpenseDataset] => [`random ${seed}`, randomLedger(seed)]),
  ]
  for (const [name, source] of sources) cases.push(await serve(name, source))
}, SLOW)

afterAll(() => {
  vi.useRealTimers()
})

describe('the test ledgers', () => {
  it('hold the corners the parts have to get right', () => {
    const all = cases.flatMap((c) => c.rows)
    const has = (test: (t: Transaction) => boolean) => all.some(test)
    expect(has((t) => t.type === 'investment' && t.amountCents < 0)).toBe(true)
    expect(has((t) => t.planId != null)).toBe(true)
    expect(has((t) => t.flagId != null)).toBe(true)
    expect(has((t) => t.settledBy != null)).toBe(true)
    expect(has((t) => (t.reportCount ?? 0) > 0)).toBe(true)
    expect(has((t) => t.cancelled)).toBe(true)
    expect(has((t) => t.amountCents === 0)).toBe(true)
    expect(has((t) => (t.labelIds?.length ?? 0) > 1)).toBe(true)
    const pointed = new Set(all.flatMap((t) => (t.settledBy != null ? [t.settledBy] : [])))
    expect(has((t) => pointed.has(t.id) && !t.reportCount)).toBe(true)
    expect(cases.some((c) => c.dataset.attachments.length > 0)).toBe(true)
    expect(cases.some((c) => c.rows.length === 0)).toBe(true)
  })
})

describe('the reference part', () => {
  it('holds the reference tables, the pinned rows, the months and the counts of every ledger', async () => {
    for (const c of cases) {
      const part = await c.repo.readLedgerReference(OWNER)
      expect(part.reference, c.name).toEqual(referenceTablesOf(c.dataset))
      expect(part.pinned, c.name).toEqual(partitionPinned(c.rows).pinned)
      expect(part.months, c.name).toEqual(c.months)
      expect(part.rowCount, c.name).toBe(c.rows.length)
      expect(Object.values(part.rowsPerMonth).reduce((a, b) => a + b, 0), c.name).toBe(c.rows.length)
      for (const month of c.months) {
        expect(part.rowsPerMonth[month], `${c.name} ${month}`).toBe(c.rows.filter((t) => t.budgetMonth === month).length)
      }
    }
  }, SLOW)

  it('counts receipts on the pinned rows that have any, and on no other', async () => {
    const c = cases.find((x) => x.name === 'synthetic')!
    const part = await c.repo.readLedgerReference(OWNER)
    const want: Record<number, number> = {}
    const pinned = new Set(part.pinned.map((t) => t.id))
    for (const a of c.dataset.attachments) if (pinned.has(a.transactionId)) want[a.transactionId] = (want[a.transactionId] ?? 0) + 1
    expect(Object.keys(want).length).toBeGreaterThan(0)
    expect(part.attachmentCounts).toEqual(want)
  })

  it('is what the in-memory reference computes from the same dataset', async () => {
    for (const c of cases) expect(await c.repo.readLedgerReference(OWNER), c.name).toEqual(ledgerReferenceOf(c.dataset))
  }, SLOW)

  it('sends the pinned rows in the order the API returns rows', async () => {
    const c = cases.find((x) => x.name === 'adversarial')!
    const { pinned } = await c.repo.readLedgerReference(OWNER)
    expect(pinned.length).toBeGreaterThan(100)
    const sorted = [...pinned].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    expect(pinned.map((t) => t.id)).toEqual(sorted.map((t) => t.id))
  })
})

describe('the rows of a range of months', () => {
  it('are the dataset’s rows in that range, in the order the API returns them', async () => {
    let compared = 0
    for (const c of cases) {
      for (const [from, to] of rangesOf(c.months)) {
        const part = await c.repo.readMonthRows(OWNER, { from, to }, EVERY_ROW)
        const want = c.rows.filter((t) => inRange(t, from, to))
        expect(part?.transactions, `${c.name} ${from}..${to}`).toEqual(want)
        compared += want.length
      }
    }
    expect(compared).toBeGreaterThan(20_000)
  }, SLOW)

  it('count the receipts of exactly the rows they carry', async () => {
    const c = cases.find((x) => x.name === 'synthetic')!
    const part = await c.repo.readMonthRows(OWNER, { from: c.months[0]!, to: c.months.at(-1)! }, EVERY_ROW)
    const want: Record<number, number> = {}
    for (const a of c.dataset.attachments) want[a.transactionId] = (want[a.transactionId] ?? 0) + 1
    expect(Object.keys(want).length).toBeGreaterThan(10)
    expect(part?.attachmentCounts).toEqual(want)
  })
})

describe('the cube of a range of months', () => {
  it('is what buildCells makes of the unpinned rows in it, for every month and range', async () => {
    let cellCount = 0
    for (const c of cases) {
      const unpinned = partitionPinned(c.rows).rest
      for (const [from, to] of rangesOf(c.months)) {
        const cells = await c.repo.readMonthCells(OWNER, { from, to }, EVERY_ROW)
        const want = buildCells(unpinned.filter((t) => inRange(t, from, to)))
        expect(cells, `${c.name} ${from}..${to}`).toEqual(want)
        cellCount += want.length
      }
    }
    expect(cellCount).toBeGreaterThan(10_000)
  }, SLOW)

  it('keeps the cell of a month that has only cancelled rows, and of a sum of zero', async () => {
    const c = cases.find((x) => x.name === 'adversarial')!
    const cells = await c.repo.readMonthCells(OWNER, { from: c.months[0]!, to: c.months.at(-1)! }, EVERY_ROW)
    const live = new Set((cells ?? []).filter((cell) => !cell.cancelled).map((cell) => cell.budgetMonth))
    expect((cells ?? []).some((cell) => !live.has(cell.budgetMonth))).toBe(true)
    expect((cells ?? []).some((cell) => cell.amountCents === 0 && cell.count > 0)).toBe(true)
  })

  it('never holds a pinned row: the counts of the cube and the pinned rows add up to every row', async () => {
    for (const c of cases) {
      const part = await c.repo.readLedgerReference(OWNER)
      const cells = (await c.repo.readMonthCells(OWNER, { from: '0001-01', to: '9999-12' }, EVERY_ROW)) ?? []
      expect(cells.reduce((n, cell) => n + cell.count, 0) + part.pinned.length, c.name).toBe(c.rows.length)
    }
  }, SLOW)
})

/** The three parts put together the way a client would, for a screen showing `viewed`. */
async function assembled(c: Served, viewed: string): Promise<Ledger> {
  const ref = await c.repo.readLedgerReference(OWNER)
  const hydratedMonths = hydratedMonthsFor(ref.months, ref.rowCount, viewed, WINDOWED)
  const range = { from: hydratedMonths[0] ?? '9999-01', to: hydratedMonths.at(-1) ?? '9999-01' }
  const hydrated = hydratedMonths.length > 0 ? (await c.repo.readMonthRows(OWNER, range, EVERY_ROW))!.transactions : []
  const all = { from: ref.months[0] ?? '0001-01', to: ref.months.at(-1) ?? '0001-01' }
  const cube = ref.months.length > 0 ? (await c.repo.readMonthCells(OWNER, all, EVERY_ROW))! : []
  const held = new Set(hydratedMonths)
  return {
    reference: { ...ref.reference, attachments: [] },
    pinned: ref.pinned,
    hydratedMonths,
    hydrated,
    cells: cube.filter((cell) => !held.has(cell.budgetMonth)),
  }
}

describe('reference, rows and cube put together', () => {
  const sample = ['synthetic', 'adversarial', 'awkward', ...[1, 4, 9, 17, 23, 31].map((s) => `random ${s}`)]

  it('are the ledger the model builds from the whole dataset', async () => {
    for (const c of cases.filter((x) => sample.includes(x.name))) {
      for (const viewed of [c.months.at(-1) ?? '2026-06', c.months[Math.floor(c.months.length / 2)] ?? '2026-06']) {
        const want = buildLedger(c.dataset, hydratedMonthsFor(c.months, c.rows.length, viewed, WINDOWED))
        const got = await assembled(c, viewed)
        expect(got, `${c.name} ${viewed}`).toEqual({ ...want, reference: { ...want.reference, attachments: [] } })
      }
    }
  }, SLOW)

  it('give the engines the same answers as the whole ledger, apart from the global lists', async () => {
    const keys = Object.keys(outputs(randomLedger(0), wholeLedger(randomLedger(0)), '2026-06', classifyFixedSpend([])))
      .filter((key) => !(key in GLOBAL_DIFFERENCES))
    expect(keys.length).toBeGreaterThan(40)
    for (const c of cases.filter((x) => sample.includes(x.name))) {
      const classifier = classifyFixedSpend(c.rows)
      const groups = recurringFixedGroups(c.rows)
      for (const viewed of [c.months.at(-1) ?? '2026-06', c.months[Math.floor(c.months.length / 2)] ?? '2026-06']) {
        const lists = assembleRows(await assembled(c, viewed))
        for (const clock of [LATER, openAt(viewed)]) {
          const options = { clock, classifier, groups }
          expect(differing(c.dataset, viewed, wholeLedger(c.dataset), lists, keys, options), `${c.name} ${viewed}`).toEqual([])
        }
      }
    }
  }, SLOW)
})

describe('the statements', () => {
  it('bind a handful of values whatever the ledger holds, far below the 100 D1 allows', async () => {
    const c = cases.find((x) => x.name === 'adversarial')!
    c.kit.statements.length = 0
    await c.repo.readLedgerReference(OWNER)
    await c.repo.readMonthRows(OWNER, { from: c.months[0]!, to: c.months.at(-1)! }, EVERY_ROW)
    await c.repo.readMonthCells(OWNER, { from: c.months[0]!, to: c.months.at(-1)! }, EVERY_ROW)
    const mostBound = Math.max(...c.kit.statements.map((s) => s.params.length))
    expect(c.kit.statements.length).toBeGreaterThan(10)
    expect(mostBound).toBeLessThanOrEqual(6)
  })

  it('are refused by the stand-in when they bind more than it allows, so the limit is live here', async () => {
    const strict = queryDb(syntheticLedger({ months: 2, perMonth: 5 }), [], { maxBoundParameters: 2 })
    const repo = createD1ExpenseRepository({ DB: strict.d1 })
    await expect(repo.readMonthRows(OWNER, { from: '2026-01', to: '2026-12' }, 10)).rejects.toThrow(/too many SQL variables/)
  })
})
