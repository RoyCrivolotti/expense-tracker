/**
 * Pins what docs/ENGINE-HISTORY.md says each engine reads. It builds the ledger the model in
 * docs/SCALING.md would hand an engine (real rows for a window around the viewed month, one summed
 * row per (budget month, account, category, type, cancelled, sign) cell for the rest, and the
 * pinned rows kept real) with `src/domain/ledger` and compares each engine's output with its output
 * on the full ledger.
 */
import { describe, expect, it } from 'vitest'
import type { ExpenseDataset, Transaction } from '../domain/types'
import {
  addDaysIso,
  averageMonthlySpendCents,
  classifyFixedSpend,
  computeOverviewKpis,
  computeSpendingBaseline,
  daysBetween,
  detectUpcoming,
  fixedRhythm,
  monthsBetweenBudget,
  portfolioReturn,
  recurringFixedGroups,
  shiftBudgetMonth,
  sortedMonths,
  splitGap,
} from '../domain/engine'
import { groupTransactions } from '../domain/engine/recurringDetect'
import { makeTxn } from '../domain/engine/recurringTestHelpers'
import { assembleRows, buildCells, buildLedger, cellRows } from '../domain/ledger'
import { KPI_KEYS, LINKED_KEYS, type Lists, NOW, ROW_READERS, SUMS_ONLY, differing, wholeLedger } from './engineOutputs'
import { makeTransaction, makeWealthAccount, makeWealthCheckin } from './factories'
import { samplePlan } from './samplePlan'
import { syntheticLedger } from './syntheticLedger'

const OPEN_MONTH = NOW.openMonth

interface Window {
  /** Which budget months keep their real rows. */
  keep: (month: string) => boolean
  /** Whether the pinned rows stay real. Off only to show what pinning is for. */
  pin: boolean
}

/** Months from `back` before `viewed` to `forward` after it. -1 back leaves the viewed month itself summed. */
function calendarWindow(viewed: string, back: number, forward = 0): (month: string) => boolean {
  const first = shiftBudgetMonth(viewed, -back)
  const last = shiftBudgetMonth(viewed, forward)
  return (month) => month >= first && month <= last
}

/** The `count` newest months with data up to and including `viewed`, however far apart they are. */
function dataMonthWindow(ds: ExpenseDataset, viewed: string, count: number): (month: string) => boolean {
  const months = sortedMonths(ds.transactions.map((t) => t.budgetMonth))
  const recent = new Set(months.filter((m) => m <= viewed).slice(-count))
  return (month) => recent.has(month)
}

function compact(ds: ExpenseDataset, win: Window): Lists {
  const hydrated = sortedMonths(ds.transactions.map((t) => t.budgetMonth)).filter(win.keep)
  if (win.pin) return assembleRows(buildLedger(ds, hydrated))
  const kept = new Set(hydrated)
  const real = ds.transactions.filter((t) => kept.has(t.budgetMonth))
  const summed = cellRows(
    buildCells(ds.transactions.filter((t) => !kept.has(t.budgetMonth))),
    ds.accounts,
    ds.accountStatements,
  )
  const byDate = (a: Transaction, b: Transaction) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)
  return { real, linear: [...real, ...summed].sort(byDate) }
}

function sameOutput(ds: ExpenseDataset, viewed: string, win: Window, keys: string[]): string[] {
  return differing(ds, viewed, wholeLedger(ds), compact(ds, win), keys)
}

/** The fewest months before `viewed` that must stay real for `key` to match the full ledger. */
function smallestWindow(ds: ExpenseDataset, viewed: string, key: string): number {
  let needed = -1
  for (let back = 26; back >= -1; back--) {
    if (sameOutput(ds, viewed, { keep: calendarWindow(viewed, back), pin: true }, [key]).length > 0) {
      needed = back + 1
      break
    }
  }
  return needed
}

const ledger = syntheticLedger({ months: 60, perMonth: 25, endMonth: '2026-09' })
/** No rows at all in five months before the open month. */
const gapped: ExpenseDataset = {
  ...ledger,
  transactions: ledger.transactions.filter((t) => t.budgetMonth < '2026-02' || t.budgetMonth > '2026-06'),
}

describe('engine history: old months as one summed row per cell', () => {
  it.each(['2026-09', '2025-06', '2023-01'])('sums-only consumers match with no real rows around %s', (viewed) => {
    expect(sameOutput(ledger, viewed, { keep: calendarWindow(viewed, -1), pin: true }, SUMS_ONLY)).toEqual([])
  })

  it('the Overview KPIs match with no real rows when the viewed month is closed', () => {
    expect(sameOutput(ledger, '2025-06', { keep: calendarWindow('2025-06', -1), pin: true }, KPI_KEYS)).toEqual([])
  })

  it('windows count months with data, so a gap stretches them', () => {
    expect(smallestWindow(ledger, OPEN_MONTH, 'movers')).toBe(3)
    expect(smallestWindow(gapped, OPEN_MONTH, 'movers')).toBe(8)
    expect(smallestWindow(gapped, OPEN_MONTH, 'kpis:month:avg3:committed')).toBe(8)
  })

  it('the open month reads real rows because the same-days cut reaches the months it is compared with', () => {
    const open = (key: string) => smallestWindow(ledger, OPEN_MONTH, key)
    expect(open('kpis:month:prevMonth:committed')).toBe(1)
    expect(open('kpis:month:avg3:committed')).toBe(3)
    expect(open('kpis:month:prevYear:committed')).toBe(12)
    expect(open('kpis:ytd:avg3:committed')).toBe(12)
    expect(open('kpis:last12:prevYear:committed')).toBe(12)
    expect(open('movers')).toBe(3)
    expect(open('groupsByCategory')).toBe(3)
    expect(open('allocation')).toBe(0)
  })

  it('a closed month reads real rows only where a row has to be classified', () => {
    const closed = (key: string) => smallestWindow(ledger, '2025-06', key)
    expect(closed('groupsByCategory')).toBe(0)
    expect(closed('allocation')).toBe(0)
    expect(closed('movers')).toBe(3)
  })

  describe('the 13 newest months with data', () => {
    const READERS = [...ROW_READERS, ...KPI_KEYS]
    const withRows = (ds: ExpenseDataset, viewed: string, count: number) =>
      sameOutput(ds, viewed, { keep: dataMonthWindow(ds, viewed, count), pin: true }, READERS)

    it.each([
      ['no gaps, open month', ledger, OPEN_MONTH],
      ['no gaps, closed month', ledger, '2025-06'],
      ['a five month gap, open month', gapped, OPEN_MONTH],
    ])('keeps every row reader whole (%s)', (_label, ds, viewed) => {
      expect(withRows(ds, viewed, 13)).toEqual([])
    })

    it('is one month more than the readers need when there is no gap, and a calendar window is short with one', () => {
      expect(withRows(ledger, OPEN_MONTH, 12)).toContain('kpis:month:prevYear:committed')
      const calendar = (back: number) =>
        sameOutput(gapped, OPEN_MONTH, { keep: calendarWindow(OPEN_MONTH, back), pin: true }, READERS)
      expect(calendar(13)).not.toEqual([])
    })
  })

  it('pinning is what keeps the link-based and exact-date consumers whole', () => {
    const small = (pin: boolean) => compact(ledger, { keep: calendarWindow('2025-06', 13), pin })
    const run = (pin: boolean) => differing(ledger, '2025-06', wholeLedger(ledger), small(pin), LINKED_KEYS)
    expect(run(true)).toEqual([])
    expect(run(false)).toEqual(
      expect.arrayContaining(['portfolioReturn', 'splitGap', 'flagGroups', 'pastReports', 'planProgress']),
    )
  })

  it('fixed against flexible differs on any window short of the whole history, and reads rows after the viewed month', () => {
    const keys = ['groupsByFixedFlexible', 'detailByFixedFlexible', 'fixedCosts']
    const at = (back: number, forward = 0) =>
      sameOutput(ledger, OPEN_MONTH, { keep: calendarWindow(OPEN_MONTH, back, forward), pin: true }, keys)
    expect(at(13)).toEqual(keys)
    expect(at(36)).toEqual(keys)
    expect(at(59)).toEqual([])
    const past = (back: number, forward: number) =>
      sameOutput(ledger, '2025-06', { keep: calendarWindow('2025-06', back, forward), pin: true }, keys)
    expect(past(44, 0)).toEqual(keys)
    expect(past(44, 99)).toEqual([])
  })

  it('fixed against flexible matches on a 13 month window once the classifier and series of the whole history are passed in', () => {
    const keys = ['groupsByFixedFlexible', 'detailByFixedFlexible', 'fixedCosts', 'pace']
    const groups = recurringFixedGroups(ledger.transactions)
    const at = (viewed: string, back: number, forward = 0) =>
      differing(ledger, viewed, wholeLedger(ledger), compact(ledger, { keep: calendarWindow(viewed, back, forward), pin: true }), keys, {
        groups,
      })
    expect(at(OPEN_MONTH, 13)).toEqual([])
    expect(at('2025-06', 13)).toEqual([])
    expect(at('2025-06', 13, 99)).toEqual([])
  })

  it('the global lists follow today, not the viewed month', () => {
    const lists = ['latestEight', 'recentlyAdded']
    expect(sameOutput(ledger, OPEN_MONTH, { keep: calendarWindow(OPEN_MONTH, 13), pin: true }, lists)).toEqual([])
    expect(sameOutput(ledger, '2025-06', { keep: calendarWindow('2025-06', 13), pin: true }, lists)).toEqual(lists)
  })
})

describe('engine history: recurring detection, cash reserve, portfolio return and the cut', () => {
  const row = (id: number, month: string, cents: number, type: Transaction['type'] = 'expense') =>
    makeTransaction({ id, date: `${month}-10`, budgetMonth: month, amountCents: cents, type })

  it('cash reserve: the last 12 months with spend can span 18 calendar months', () => {
    const spend = (months: string[], cents: number, from: number) => months.map((m, i) => row(from + i, m, cents))
    const run = (first: string, count: number) => Array.from({ length: count }, (_, i) => shiftBudgetMonth(first, i))
    const rows = [
      ...spend(run('2025-01', 6), 100_000, 1),
      ...run('2025-07', 6).map((m, i) => row(100 + i, m, 300_000, 'income')),
      ...spend(run('2026-01', 6), 200_000, 200),
    ]
    expect(averageMonthlySpendCents(rows, '2026-07')).toBe(150_000)
    expect(monthsBetweenBudget('2025-01', '2026-06') + 1).toBe(18)
    const lastTwelveCalendarMonths = rows.filter((t) => t.budgetMonth >= shiftBudgetMonth('2026-07', -12))
    expect(averageMonthlySpendCents(lastTwelveCalendarMonths, '2026-07')).toBe(200_000)
  })

  describe('recurring detection', () => {
    const series = (dates: string[]) => dates.map((date, i) => makeTxn({ id: i + 1, date, description: 'Car insurance' }))
    const spaced = (gaps: number[], start = '2024-01-01') =>
      gaps.reduce<string[]>((dates, gap) => [...dates, addDaysIso(dates[dates.length - 1]!, gap)], [start])
    const rhythm = (dates: string[]) => {
      const group = groupTransactions(series(dates))[0]
      return group ? fixedRhythm(group) : 'no group'
    }

    it('needs three occurrences', () => {
      expect(rhythm(spaced([365]))).toBe('no group')
      expect(rhythm(spaced([365, 365]))).toBe('yearly')
    })

    it('calls a yearly series from 340 to 395 day gaps, so three occurrences span 680 to 790 days', () => {
      expect(rhythm(spaced([340, 340]))).toBe('yearly')
      expect(rhythm(spaced([395, 395]))).toBe('yearly')
      expect(rhythm(spaced([339, 339]))).toBeNull()
      expect(rhythm(spaced([396, 396]))).toBeNull()
      const days = (gaps: number[]) => {
        const dates = spaced(gaps)
        return daysBetween(dates[0]!, dates[dates.length - 1]!)
      }
      expect([days([340, 340]), days([395, 395])]).toEqual([680, 790])
    })

    it('the upcoming card only looks at monthly series, so a yearly one never reaches it', () => {
      const yearly = series(['2024-03-10', '2025-03-10', '2026-03-10'])
      expect(detectUpcoming(yearly, { today: '2027-03-09' })).toEqual([])
      const monthly = series(['2026-05-10', '2026-06-10', '2026-07-10'])
      expect(detectUpcoming(monthly, { today: '2026-08-09' })).toHaveLength(1)
    })

    it('the median and regularity are taken over every gap, so a shorter history can classify differently', () => {
      const gaps = [30, 30, 30, 30, 30, 60, 10, 90, 15]
      const dates = spaced(gaps)
      expect(rhythm(dates)).toBeNull()
      expect(rhythm(dates.slice(0, 6))).toBe('monthly')
      expect(rhythm(dates.slice(-2))).toBe('no group')
    })

    it('a row is classified by rows dated after it', () => {
      const monthly = series(['2025-01-05', '2025-02-05', '2025-03-05'])
      const firstTwo = monthly.slice(0, 2)
      expect(classifyFixedSpend(firstTwo).isFixed(monthly[1]!)).toBe(false)
      expect(classifyFixedSpend(monthly).isFixed(monthly[1]!)).toBe(true)
    })
  })

  describe('portfolio return and gap split', () => {
    const accounts = [makeWealthAccount({ id: 1, kind: 'investment' })]
    const checkin = (id: number, date: string, cents: number) =>
      makeWealthCheckin({ id, checkinDate: date, entries: [{ accountId: 1, valueCents: cents }] })
    const deposit = (id: number, date: string, cents: number) =>
      makeTransaction({ id, date, budgetMonth: date.slice(0, 7), type: 'investment', amountCents: cents })
    const checkins = [checkin(1, '2024-01-01', 1_000_000), checkin(2, '2025-01-01', 2_000_000), checkin(3, '2026-07-01', 3_500_000)]
    const flows = [
      deposit(1, '2024-06-15', 500_000),
      deposit(2, '2025-03-10', 300_000),
      deposit(3, '2026-02-20', -100_000),
    ]
    const periodReturn = (rows: Transaction[]) => portfolioReturn(checkins, accounts, rows)?.periodReturn

    it('needs every investment from the first check-in, by exact date and sign', () => {
      const full = periodReturn(flows)
      expect(full).toBeDefined()
      expect(periodReturn(flows.slice(1))).not.toBe(full)
      expect(periodReturn(flows.filter((t) => t.amountCents > 0))).not.toBe(full)
      const monthStart = flows.map((t) => ({ ...t, date: `${t.budgetMonth}-01` }))
      expect(periodReturn(monthStart)).not.toBe(full)
      const onFirstDay = [...flows, deposit(4, '2024-01-01', 400_000)]
      const dayAfter = [...flows, deposit(4, '2024-01-02', 400_000)]
      expect(periodReturn(onFirstDay)).toBe(full)
      expect(periodReturn(dayAfter)).not.toBe(full)
    })

    it('gap split reads the same rows from the first check-in on or after the plan start', () => {
      const plan = samplePlan({ housePurchaseYear: null, lifeEvents: [], planStartDate: '2026-01-01' })
      const first = checkin(1, '2026-01-31', 5_200_000)
      const last = checkin(2, '2026-09-30', 6_300_000)
      const monthly = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map(
        (m, i) => deposit(10 + i, `${m}-15`, 100_000),
      )
      const gap = (rows: Transaction[]) => {
        const out = splitGap(plan, [first, last], accounts, rows, 0.02)
        return out.kind === 'split' ? out.parts.saving : null
      }
      expect(gap(monthly)).not.toBeNull()
      expect(gap(monthly.slice(2))).not.toBe(gap(monthly))
    })
  })

  describe('the same-days cut and months with data', () => {
    it('cuts the month it compares with as well, so that month needs its dates', () => {
      const rows = [
        makeTransaction({ id: 1, date: '2026-09-03', budgetMonth: '2026-09', amountCents: 1_000 }),
        makeTransaction({ id: 2, date: '2026-08-05', budgetMonth: '2026-08', amountCents: 2_000 }),
        makeTransaction({ id: 3, date: '2026-08-20', budgetMonth: '2026-08', amountCents: 4_000 }),
      ]
      const spend = (tx: Transaction[]) =>
        computeOverviewKpis(tx, {
          months: ['2026-08', '2026-09'],
          month: '2026-09',
          period: 'month',
          compare: 'prevMonth',
          basis: 'paid',
          today: '2026-09-10',
          openMonth: '2026-09',
        }).baseline?.spendCents
      expect(spend(rows)).toBe(2_000)
      const summed = [rows[0]!, { ...rows[1]!, id: 4, date: '2026-08-01', amountCents: 6_000 }]
      expect(spend(summed)).toBe(6_000)
    })

    it('measures the 12 months that have data, not the 12 calendar months before', () => {
      const months = [...Array.from({ length: 6 }, (_, i) => `2025-0${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `2026-0${i + 1}`)]
      const rows = months.map((m, i) => makeTransaction({ id: i + 1, date: `${m}-10`, budgetMonth: m }))
      const baseline = computeSpendingBaseline(rows, [], [], { months, month: '2026-07', basis: 'paid' })
      expect(baseline?.months).toHaveLength(12)
      expect(baseline?.months[0]).toBe('2025-01')
    })
  })
})
