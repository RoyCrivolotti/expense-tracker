/**
 * Every viewed month of a 60 month adversarial ledger, with the consumers of docs/ENGINE-HISTORY.md
 * run over every row and over the lists assembled from a 13 month window, once with every viewed month
 * closed and once with it as the open month (so the same-days cut applies). The only differences allowed
 * are the ones written down in `INTENDED_DIFFERENCES`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { classifyFixedSpend, recurringFixedGroups, sortedMonths } from '../domain/engine'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, assembleRows, ledgerFor } from '../domain/ledger'
import { buildExpenseModel } from '../ui/buildExpenseModel'
import { buildOverviewData } from '../ui/analytics/overview/overviewModel'
import { ADVERSARIAL_ROLLOVER_DAY, adversarialLedger } from './adversarialLedger'
import { LATER, differing, fingerprint, openAt, outputs, plain, wholeLedger } from './engineOutputs'
import {
  GLOBAL_DIFFERENCES,
  INTENDED_DIFFERENCES,
  ONLY_WHILE_OPEN,
  PACE_ENVELOPE_FIELDS,
} from './intendedDifferences'

const ds = adversarialLedger()
const whole = wholeLedger(ds)
const classifier = classifyFixedSpend(ds.transactions)
const groups = recurringFixedGroups(ds.transactions)
const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
const KEYS = Object.keys(outputs(ds, whole, months[0]!, classifier))

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const clockFor = (mode: 'closed' | 'open', month: string) => (mode === 'closed' ? LATER : openAt(month))

type Fingerprints = Record<string, string>

/** What every consumer gave for one viewed month, on each set of lists. */
interface Snapshot {
  /** Over every row. */
  reference: Fingerprints
  /** Over the lists from a 13 month window. */
  windowed: Fingerprints
  /** The same lists, with the engines handed the classifier and series of the whole history. */
  windowedWithHistory: Fingerprints
  /** Over the lists from the default size policy. */
  defaultPolicy: Fingerprints
}

/** The pace without the fields the envelope feeds. */
function paceOutsideEnvelope(pace: unknown): string {
  const fields = Object.entries(pace as Record<string, unknown>).filter(([k]) => !PACE_ENVELOPE_FIELDS.includes(k))
  return JSON.stringify(plain(Object.fromEntries(fields)))
}

function run(lists: typeof whole, month: string, mode: 'closed' | 'open', withHistory = false): Fingerprints {
  const out = outputs(ds, lists, month, classifier, clockFor(mode, month), withHistory ? groups : undefined)
  return { ...fingerprint(out, KEYS), paceOutsideEnvelope: paceOutsideEnvelope(out.pace!()) }
}

/**
 * Every consumer for every viewed month, run once per set of lists and kept, so the tests below compare
 * results instead of running the engines again. The whole-ledger run is shared: it does not depend on
 * which lists are being compared, and handing it its own classifier and series changes nothing (checked
 * below).
 */
function snapshots(mode: 'closed' | 'open'): Map<string, Snapshot> {
  return new Map(
    months.map((month) => {
      const windowed = assembleRows(ledgerFor(ds, month, WINDOWED))
      return [
        month,
        {
          reference: run(whole, month, mode),
          windowed: run(windowed, month, mode),
          windowedWithHistory: run(windowed, month, mode, true),
          defaultPolicy: run(assembleRows(ledgerFor(ds, month)), month, mode),
        },
      ]
    }),
  )
}

type Side = 'windowed' | 'windowedWithHistory' | 'defaultPolicy'

/** For each consumer, the viewed months in which the lists gave a different answer. */
function sweep(snaps: Map<string, Snapshot>, side: Side): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  for (const [month, snap] of snaps) {
    for (const key of KEYS.filter((k) => snap[side][k] !== snap.reference[k])) {
      seen.set(key, [...(seen.get(key) ?? []), month])
    }
  }
  return seen
}

describe('the adversarial ledger', () => {
  it('has what it was built to have', () => {
    const tx = ds.transactions
    expect(ds.settings.budgetRolloverDay).toBe(ADVERSARIAL_ROLLOVER_DAY)
    expect(tx.some((t) => t.date.slice(0, 7) !== t.budgetMonth && t.planId == null)).toBe(true)
    expect(tx.some((t) => t.planId != null)).toBe(true)
    expect(tx.some((t) => t.flagId != null && t.budgetMonth < '2022-01')).toBe(true)
    expect(tx.some((t) => t.description === 'Water bill')).toBe(true)
    expect(tx.some((t) => t.description === 'Car insurance')).toBe(true)
    const live = new Set(tx.filter((t) => !t.cancelled).map((t) => t.budgetMonth))
    expect(months.filter((m) => !live.has(m)).length).toBeGreaterThanOrEqual(3)
    const gaps = months.filter((m, i) => i > 0 && sortedMonths([months[i - 1]!, m]).length === 2 && m !== nextMonth(months[i - 1]!))
    expect(gaps.length).toBeGreaterThanOrEqual(2)
    expect(months.length).toBeGreaterThanOrEqual(50)
  })
})

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

describe.each(['closed', 'open'] as const)('viewed-month sweep, %s month', (mode) => {
  let snaps = new Map<string, Snapshot>()
  // Five runs of every consumer over 57 months take a few seconds on a CI runner with coverage on,
  // which would be counted against whichever test came first, so the hook gets its own timeout.
  beforeAll(() => {
    snaps = snapshots(mode)
  }, 120_000)

  it('differs from the whole ledger only where intended, and every intended difference shows up', () => {
    const intended = Object.keys(INTENDED_DIFFERENCES).filter((k) => mode === 'open' || !ONLY_WHILE_OPEN.includes(k))
    expect([...sweep(snaps, 'windowed').keys()].sort()).toEqual(intended.sort())
  })

  it('differs in the spending pace only in the fields the envelope feeds', () => {
    for (const [month, snap] of snaps) {
      expect(snap.windowed['paceOutsideEnvelope'], month).toBe(snap.reference['paceOutsideEnvelope'])
    }
  })

  it('differs only in the global lists once the classifier and series of the whole history are passed in', () => {
    expect([...sweep(snaps, 'windowedWithHistory').keys()].sort()).toEqual(Object.keys(GLOBAL_DIFFERENCES).sort())
  })

  it('is exactly today\'s behaviour under the default size policy', () => {
    expect([...sweep(snaps, 'defaultPolicy').keys()]).toEqual([])
  })

  it('gives the whole ledger the same answers whether or not it is handed its own classifier and series', () => {
    for (const month of [months[0]!, months[Math.floor(months.length / 2)]!, months.at(-1)!]) {
      const lists = whole
      expect(run(lists, month, mode, true), month).toEqual(snaps.get(month)!.reference)
    }
  })
})

describe('the newest rows', () => {
  it('are held by the window around the newest month and by no window a year back', () => {
    const newest = months.at(-1)!
    const lists = (month: string) => assembleRows(ledgerFor(ds, month, WINDOWED))
    const lists_ = ['latestEight', 'recentlyAdded']
    expect(differing(ds, newest, whole, lists(newest), lists_, { clock: LATER, classifier })).toEqual([])
    expect(differing(ds, months.at(-14)!, whole, lists(months.at(-14)!), lists_, { clock: LATER, classifier })).toEqual(lists_)
  })
})

describe('the Overview screen model', () => {
  const modelFrom = (rows: typeof ds.transactions) => buildExpenseModel({ ...ds, transactions: rows })
  const overview = (rows: typeof ds.transactions, month: string) =>
    buildOverviewData(modelFrom(rows), { month, period: 'month', compare: 'prevMonth', basis: 'committed', ...openAt(month) })

  it('matches in the KPIs, baseline and unpaid caps, and differs only where a classifier is built from the rows', () => {
    const differs = new Map<string, number>()
    for (const month of months) {
      const { linear } = assembleRows(ledgerFor(ds, month, WINDOWED))
      const a = overview(ds.transactions, month) as unknown as Record<string, unknown>
      const b = overview(linear, month) as unknown as Record<string, unknown>
      for (const key of Object.keys(a)) {
        if (JSON.stringify(plain(a[key])) !== JSON.stringify(plain(b[key]))) differs.set(key, (differs.get(key) ?? 0) + 1)
      }
    }
    // The model builds its classifier from the rows it is handed, so everything that reads one can differ.
    expect([...differs.keys()].sort()).toEqual(['allocation', 'fixedCosts', 'movers', 'pace', 'signals'].sort())
  })
})
