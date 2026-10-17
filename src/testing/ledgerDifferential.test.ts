/**
 * The ledger model against the engines, which are the reference for every number. Each test runs the
 * consumers listed in docs/ENGINE-HISTORY.md over every row, and again over the lists assembled from a
 * ledger with real rows for some months and summed cells for the rest, and compares the results.
 *
 * Where the two are expected to differ, the difference is written down below by hand with the reason.
 * A test that compared the model with itself could not catch a wrong specification, so nothing here is
 * derived from the code under test: a consumer missing from the list fails the test, and so does a
 * listed one that never differs.
 */
import { describe, expect, it } from 'vitest'
import {
  classifyFixedSpend,
  deriveTransactions,
  recurringFixedGroups,
  shiftBudgetMonth,
  sortedMonths,
} from '../domain/engine'
import {
  type HydrationPolicy,
  HYDRATED_DATA_MONTHS,
  assembleRows,
  buildCells,
  buildLedger,
  ledgerFor,
} from '../domain/ledger'
import type { ExpenseDataset, Transaction } from '../domain/types'
import { adversarialLedger } from './adversarialLedger'
import {
  type Clock,
  KPI_KEYS,
  LATER,
  SUMS_ONLY,
  differing,
  openAt,
  outputs,
  wholeLedger,
} from './engineOutputs'
import { GLOBAL_DIFFERENCES, INTENDED_DIFFERENCES, OWN_CLASSIFIER_DIFFERENCES } from './intendedDifferences'
import { makeDataset, makeTransaction } from './factories'
import { randomLedger } from './randomLedger'

/** The production window, forced on regardless of size. */
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

const ALL_KEYS = Object.keys(
  outputs(randomLedger(0), wholeLedger(randomLedger(0)), '2026-06', classifyFixedSpend([])),
)
const MUST_MATCH = ALL_KEYS.filter((k) => !(k in INTENDED_DIFFERENCES))
const MUST_MATCH_WITH_HISTORY = ALL_KEYS.filter((k) => !(k in GLOBAL_DIFFERENCES))

/** The month picker's months, plus the months a deep link could open: past the newest and before the oldest. */
function viewedMonths(ds: ExpenseDataset): string[] {
  const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
  if (months.length === 0) return ['2026-06']
  const first = months[0]!
  const last = months.at(-1)!
  return [...new Set([last, first, months[Math.floor(months.length / 2)]!, shiftBudgetMonth(last, 2), shiftBudgetMonth(first, -1)])]
}

function clocksFor(viewed: string): [string, Clock][] {
  return [
    ['closed', LATER],
    ['open', openAt(viewed)],
  ]
}

describe('the model against the engines: seeded random ledgers', () => {
  const seeds = Array.from({ length: 80 }, (_, i) => i)
  const failures = (policy: HydrationPolicy | 'none', keys: string[], passHistory = false): string[] =>
    seeds.flatMap((seed) => {
      const ds = randomLedger(seed)
      const classifier = classifyFixedSpend(ds.transactions)
      const groups = passHistory ? recurringFixedGroups(ds.transactions) : undefined
      return viewedMonths(ds).flatMap((viewed) => {
        const ledger = policy === 'none' ? buildLedger(ds, []) : ledgerFor(ds, viewed, policy)
        return clocksFor(viewed).flatMap(([name, clock]) =>
          differing(ds, viewed, wholeLedger(ds), assembleRows(ledger), keys, {
            clock,
            classifier,
            ...(groups ? { groups } : {}),
          }).map((key) => `seed ${seed}, ${viewed}, ${name}: ${key}`),
        )
      })
    })

  it('covers the corners it claims to', () => {
    const ledgers = seeds.map(randomLedger)
    const has = (test: (ds: ExpenseDataset) => boolean) => ledgers.some(test)
    expect(has((ds) => ds.transactions.length === 0)).toBe(true)
    expect(has((ds) => new Set(ds.transactions.map((t) => t.budgetMonth)).size === 1)).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.type === 'investment' && t.amountCents < 0))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.type === 'refund'))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.planId != null))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.flagId != null))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.settledBy != null))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.status === 'forecast'))).toBe(true)
    expect(has(hasLegacyPayment)).toBe(true)
    expect(has(hasOrphanPayment)).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => t.amountCents === 0))).toBe(true)
    expect(has((ds) => ds.transactions.some((t) => !ds.accounts.some((a) => a.id === t.accountId)))).toBe(true)
    expect(has((ds) => ds.cashActuals.length > 0)).toBe(true)
    expect(has((ds) => ds.settings.budgetRolloverDay > 1)).toBe(true)
    expect(has(hasCancelledOnlyMonth)).toBe(true)
    expect(has(hasGap)).toBe(true)
  })

  it('gives the sum-only consumers the same answer with no real rows at all', () => {
    expect(failures('none', SUMS_ONLY)).toEqual([])
  })

  it('gives the Overview KPIs the same answer with no real rows when the month is closed', () => {
    const closedOnly = seeds.flatMap((seed) => {
      const ds = randomLedger(seed)
      const classifier = classifyFixedSpend(ds.transactions)
      return viewedMonths(ds).flatMap((viewed) =>
        differing(ds, viewed, wholeLedger(ds), assembleRows(buildLedger(ds, [])), KPI_KEYS, { clock: LATER, classifier }).map(
          (key) => `seed ${seed}, ${viewed}: ${key}`,
        ),
      )
    })
    expect(closedOnly).toEqual([])
  })

  it('gives every consumer the same answer from the 13 month window, except the intended differences', () => {
    expect(failures(WINDOWED, MUST_MATCH)).toEqual([])
  })

  it('shows the differences that passing the whole history removes', () => {
    const shown = new Set(failures(WINDOWED, Object.keys(OWN_CLASSIFIER_DIFFERENCES)).map((f) => f.split(': ')[1]))
    expect([...shown].sort()).toEqual(Object.keys(OWN_CLASSIFIER_DIFFERENCES).sort())
  })

  it('gives every consumer but the global lists the same answer once the whole history is passed in', () => {
    expect(failures(WINDOWED, MUST_MATCH_WITH_HISTORY, true)).toEqual([])
  })

  it('hands the engines the whole dataset when the ledger is small', () => {
    for (const seed of seeds) {
      const ds = randomLedger(seed)
      const ledger = ledgerFor(ds, '2026-06')
      expect(ledger.cells).toEqual([])
      expect(assembleRows(ledger)).toEqual({ linear: ds.transactions, real: ds.transactions })
    }
  })
})

function hasCancelledOnlyMonth(ds: ExpenseDataset): boolean {
  const live = new Set(ds.transactions.filter((t) => !t.cancelled).map((t) => t.budgetMonth))
  return ds.transactions.some((t) => t.cancelled && !live.has(t.budgetMonth))
}

function hasGap(ds: ExpenseDataset): boolean {
  const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
  return months.some((m, i) => i > 0 && shiftBudgetMonth(months[i - 1]!, 1) !== m)
}

describe('what each rule of the model is for', () => {
  const ds = adversarialLedger()
  const viewed = '2025-06'
  const base = ledgerFor(ds, viewed, WINDOWED)
  const hydrated = new Set(base.hydratedMonths)
  const classifier = classifyFixedSpend(ds.transactions)
  const diff = (ledger: typeof base, keys: string[]) =>
    differing(ds, viewed, wholeLedger(ds), assembleRows(ledger), keys, { clock: LATER, classifier })

  it('matches the whole ledger as built', () => {
    expect(diff(base, SUMS_ONLY)).toEqual([])
  })

  it('counts an investment twice if a cell holds it as well as the pinned row', () => {
    const sloppy = { ...base, cells: buildCells(ds.transactions.filter((t) => !hydrated.has(t.budgetMonth))) }
    expect(diff(sloppy, SUMS_ONLY)).toEqual(
      expect.arrayContaining(['monthlyTotals:committed', 'yearlyOverview', 'cashRows', 'balancesAtCost']),
    )
  })

  it('follows a statement being toggled, because a cell holds no status', () => {
    const card = ds.accounts.find((a) => a.settlement === 'deferred')!.id
    const oldMonth = base.cells.find((c) => c.accountId === card && !c.cancelled)!.budgetMonth
    const toggled = ds.accountStatements.map((st) =>
      st.accountId === card && (st.yearMonth === oldMonth || st.yearMonth === viewed) ? { ...st, paid: !st.paid } : st,
    )
    expect(toggled).not.toEqual(ds.accountStatements)
    const after: ExpenseDataset = {
      ...ds,
      accountStatements: toggled,
      transactions: deriveTransactions(ds.transactions, ds.accounts, toggled),
    }
    const rederive = (rows: typeof base.pinned) => deriveTransactions(rows, ds.accounts, toggled)
    const patched = {
      ...base,
      reference: { ...base.reference, accountStatements: toggled },
      pinned: rederive(base.pinned),
      hydrated: rederive(base.hydrated),
    }
    expect(differing(after, viewed, wholeLedger(after), assembleRows(patched), SUMS_ONLY, { clock: LATER, classifier })).toEqual([])
    expect(differing(ds, viewed, wholeLedger(after), assembleRows(base), SUMS_ONLY, { clock: LATER, classifier })).not.toEqual([])
  })
})

describe('a month with no pinned row exists only through its cell', () => {
  const row = (id: number, month: string, overrides: Partial<Transaction> = {}) =>
    makeTransaction({ id, budgetMonth: month, date: `${month}-10`, accountId: 1, amountCents: 1_000, ...overrides })
  const ds = makeDataset({
    accounts: [{ id: 1, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
    transactions: [
      row(4, '2025-04', { amountCents: 0 }),
      row(3, '2025-03', { cancelled: true, status: 'cancelled' }),
      row(2, '2025-02'),
      row(1, '2025-01'),
    ],
  })
  const viewed = '2025-04'
  const ledger = ledgerFor(ds, viewed, { fullBelowRows: 0, dataMonths: 1 })
  const diff = (cells: typeof ledger.cells) =>
    differing(ds, viewed, wholeLedger(ds), assembleRows({ ...ledger, cells }), ['months', 'goalsFlows', 'paceMonths'], {
      clock: LATER,
    })

  it('matches the whole ledger as built', () => {
    expect(ledger.cells.map((c) => c.budgetMonth)).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(diff(ledger.cells)).toEqual([])
  })

  it('loses a month if the cell of a month with only cancelled rows is dropped', () => {
    expect(diff(ledger.cells.filter((c) => !c.cancelled))).toEqual(['months'])
  })

  it('loses a month if the cell of a sum of zero is dropped', () => {
    const zeroMonth = ledgerFor(ds, '2025-02', { fullBelowRows: 0, dataMonths: 1 })
    expect(zeroMonth.cells.map((c) => c.budgetMonth)).toEqual(['2025-01', '2025-03', '2025-04'])
    const without = zeroMonth.cells.filter((c) => c.amountCents !== 0)
    const keys = ['months', 'goalsFlows']
    const small = assembleRows({ ...zeroMonth, cells: without })
    expect(differing(ds, '2025-02', wholeLedger(ds), small, keys, { clock: LATER })).toEqual(keys)
  })
})

/** A payment that rows point at but that carries no covered count. */
function hasLegacyPayment(ds: ExpenseDataset): boolean {
  const pointed = new Set(ds.transactions.flatMap((t) => (t.settledBy != null ? [t.settledBy] : [])))
  return ds.transactions.some((t) => pointed.has(t.id) && !t.reportCount)
}

/** A payment with a covered count that no row points at any more. */
function hasOrphanPayment(ds: ExpenseDataset): boolean {
  const pointed = new Set(ds.transactions.flatMap((t) => (t.settledBy != null ? [t.settledBy] : [])))
  return ds.transactions.some((t) => (t.reportCount ?? 0) > 0 && !pointed.has(t.id))
}
