/**
 * The point of serving the series: every consumer that needs a whole series gives, from the served
 * series plus a window of rows, the answer it gives over every row.
 *
 * For each ledger the series come out of the real SQL (SQLite, real migrations), are turned into the
 * groups and classifier the engines take, and every consumer in docs/ENGINE-HISTORY.md is run over the
 * lists assembled from a 13 month window with those injected. The reference is the same consumer over
 * every row with nothing injected. As in `ledgerSweep.test.ts`, the only consumers allowed to differ are
 * the three global lists, which no window and no series holds.
 */
import { describe, expect, it } from 'vitest'
import {
  classifierFromGroups,
  classifyFixedSpend,
  detectUpcoming,
  newestChargesOfSeries,
  recurringFixedGroupsFromSeries,
  shiftBudgetMonth,
  sortedMonths,
  stillStopped,
  type RecurringSeries,
} from '../../src/domain/engine'
import { addDaysIso } from '../../src/domain/engine/dates'
import { makeDataset } from '../../src/testing/factories'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, ledgerFor } from '../../src/domain/ledger'
import type { ExpenseDataset } from '../../src/domain/types'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { LATER, fingerprint, openAt, outputs, wholeLedger, type Clock } from '../../src/testing/engineOutputs'
import { GLOBAL_DIFFERENCES } from '../../src/testing/intendedDifferences'
import { randomLedger } from '../../src/testing/randomLedger'
import { OWNER, queryDb } from '../../src/testing/transactionQueryKit'
import { spelledSeries, unicodeLedger } from '../../src/testing/unicodeLedger'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const GLOBAL = Object.keys(GLOBAL_DIFFERENCES).sort()
const KEYS = Object.keys(outputs(randomLedger(0), wholeLedger(randomLedger(0)), '2026-06', classifyFixedSpend([])))

async function servedSeries(ds: ExpenseDataset): Promise<RecurringSeries[]> {
  return createD1ExpenseRepository({ DB: queryDb(ds).d1 }).readSeries(OWNER)
}

/** The month picker's months, plus the months a deep link could open: past the newest and before the oldest. */
function viewedMonths(ds: ExpenseDataset): string[] {
  const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
  if (months.length === 0) return ['2026-06']
  const first = months[0]!
  const last = months.at(-1)!
  return [...new Set([last, first, months[Math.floor(months.length / 2)]!, shiftBudgetMonth(last, 2), shiftBudgetMonth(first, -1)])]
}

const clocks = (viewed: string): Array<[string, Clock]> => [['closed', LATER], ['open', openAt(viewed)]]

/** For each consumer that differs, the number of (ledger, month, clock) runs in which it did. */
async function differences(ds: ExpenseDataset, months: string[]): Promise<Map<string, number>> {
  const groups = recurringFixedGroupsFromSeries(await servedSeries(ds))
  const served = classifierFromGroups(groups)
  const reference = classifyFixedSpend(ds.transactions)
  const found = new Map<string, number>()
  for (const viewed of months) {
    const windowed = assembleRows(ledgerFor(ds, viewed, WINDOWED))
    for (const [, clock] of clocks(viewed)) {
      const expected = fingerprint(outputs(ds, wholeLedger(ds), viewed, reference, clock), KEYS)
      const actual = fingerprint(outputs(ds, windowed, viewed, served, clock, groups), KEYS)
      for (const key of KEYS.filter((k) => expected[k] !== actual[k])) found.set(key, (found.get(key) ?? 0) + 1)
    }
  }
  return found
}

function merge(into: Map<string, number>, from: Map<string, number>): void {
  for (const [key, n] of from) into.set(key, (into.get(key) ?? 0) + n)
}

describe('every consumer from the served series and a 13 month window', () => {
  it('matches the answer over every row on 80 seeded random ledgers, apart from the three global lists', async () => {
    const all = new Map<string, number>()
    for (let seed = 0; seed < 80; seed += 1) {
      const ds = randomLedger(seed)
      const found = await differences(ds, viewedMonths(ds))
      expect([...found.keys()].filter((k) => !(k in GLOBAL_DIFFERENCES)), `seed ${seed}`).toEqual([])
      merge(all, found)
    }
    expect([...all.keys()].sort()).toEqual(GLOBAL)
  }, 180_000)

  it('matches on every viewed month of the 60 month adversarial ledger, closed and open', async () => {
    const ds = adversarialLedger()
    const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
    expect(months.length).toBeGreaterThanOrEqual(50)
    const found = await differences(ds, months)
    expect([...found.keys()].sort()).toEqual(GLOBAL)
  }, 180_000)

  it('matches on a ledger whose series are spelled with accents, other whitespace and other capitals', async () => {
    const ds = unicodeLedger()
    const found = await differences(ds, viewedMonths(ds))
    expect([...found.keys()].filter((k) => !(k in GLOBAL_DIFFERENCES))).toEqual([])
  })
})

/** The charges due, with the stopped ones set aside, on a spread of days after the newest row. */
function todays(ds: ExpenseDataset): string[] {
  const newest = ds.transactions.reduce((max, t) => (t.date > max ? t.date : max), '2020-01-01')
  return [0, 5, 12, 20, 26, 29, 31, 33, 36, 40, 50, 60].map((n) => addDaysIso(newest, n))
}

describe('upcoming charges and stopped series from the served series', () => {
  const ledgers: Array<[string, ExpenseDataset]> = [
    ...Array.from({ length: 40 }, (_, seed): [string, ExpenseDataset] => [`seed ${seed}`, randomLedger(seed)]),
    ['adversarial', adversarialLedger()],
    ['unicode', unicodeLedger()],
  ]

  it('give the same suggestions, whatever is stopped, and the same stopped list', async () => {
    let suggested = 0
    let stoppedSeries = 0
    for (const [name, ds] of ledgers) {
      const series = await servedSeries(ds)
      const groups = recurringFixedGroupsFromSeries(series)
      const known = newestChargesOfSeries(series)
      const window = assembleRows(ledgerFor(ds, sortedMonths(ds.transactions.map((t) => t.budgetMonth)).at(-1) ?? '2026-06', WINDOWED)).real
      for (const today of todays(ds)) {
        const expected = detectUpcoming(ds.transactions, { today })
        expect(detectUpcoming(window, { today, groups }), `${name} ${today}`).toEqual(expected)
        suggested += expected.length
        const stopped = Object.fromEntries(expected.map((s) => [s.seriesKey, { after: s.lastChargeDate }]))
        const early = Object.fromEntries(expected.map((s) => [s.seriesKey, { after: addDaysIso(s.lastChargeDate, -1) }]))
        for (const list of [stopped, early]) {
          expect(detectUpcoming(window, { today, groups, stopped: list }), `${name} ${today} stopped`).toEqual(
            detectUpcoming(ds.transactions, { today, stopped: list }),
          )
          expect(stillStopped(window, list, known), `${name} ${today} still stopped`).toEqual(stillStopped(ds.transactions, list))
        }
        stoppedSeries += Object.keys(stillStopped(ds.transactions, stopped)).length
      }
    }
    expect(suggested).toBeGreaterThan(50)
    expect(stoppedSeries).toBeGreaterThan(20)
  }, 120_000)

  it('predict the budget month from the median of the newest three offsets, not from the newest one', async () => {
    // A pay date near the month end, booked to the next month except in the newest month.
    const rows = spelledSeries(1, Array.from({ length: 10 }, () => 'Salary'), { type: 'income' }).map((t, i) => {
      const date = `2025-${String(i + 1).padStart(2, '0')}-28`
      const next = i + 2 > 12 ? '2026-01' : `2025-${String(i + 2).padStart(2, '0')}`
      return { ...t, date, budgetMonth: i === 9 ? date.slice(0, 7) : next }
    })
    const ds = makeDataset({ transactions: [...rows].reverse() })
    const groups = recurringFixedGroupsFromSeries(await servedSeries(ds))
    const today = '2025-11-27'
    const expected = detectUpcoming(ds.transactions, { today })
    expect(expected).toHaveLength(1)
    expect(expected[0]!.predictedBudgetMonth).toBe('2025-12')
    expect(detectUpcoming([], { today, groups })).toEqual(expected)
  })

  it('differ in one place: a stopped series with fewer than three rows left, whose newest charge is outside the window', async () => {
    const ds = randomLedger(1)
    const old = ds.transactions.filter((t) => t.description === 'Rent').slice(-2)
    const only = { ...ds, transactions: ds.transactions.filter((t) => t.description !== 'Rent' || old.includes(t)) }
    expect(old).toHaveLength(2)
    const series = await servedSeries(only)
    const key = `rent|${old[0]!.accountId}|${old[0]!.categoryId}|${old[0]!.type}`
    const stopped = { [key]: { after: addDaysIso(old[0]!.date, -400) } }
    expect(Object.keys(stillStopped(only.transactions, stopped))).toEqual([])
    expect(Object.keys(stillStopped([], stopped, newestChargesOfSeries(series)))).toEqual([key])
  })
})
