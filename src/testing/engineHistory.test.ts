/**
 * Pins what docs/ENGINE-HISTORY.md says each engine reads. It builds the ledger the model in
 * docs/SCALING.md would hand an engine (real rows for a window around the viewed month, one summed
 * row per (budget month, account, category, type, cancelled, sign) cell for the rest, and the
 * pinned rows kept real) and compares each engine's output with its output on the full ledger.
 */
import { describe, expect, it } from 'vitest'
import type { ExpenseDataset, StoredTransaction, Transaction } from '../domain/types'
import {
  type AnalyticsBasis,
  type AnalyticsPeriod,
  type CompareMode,
  addDaysIso,
  averageMonthlySpendCents,
  balancesAtCost,
  buildReimbursementLinks,
  buildStatementPayments,
  classifyFixedSpend,
  computeAllocation,
  computeBudgetHealth,
  computeCashReconciliation,
  computeCategoryActuals,
  computeMonthlyTotals,
  computeMovers,
  computeOverviewKpis,
  computeSpendingBaseline,
  computeSpendingGroupDetail,
  computeSpendingGroups,
  computeSpendingPace,
  computeYearlyOverview,
  computeYtdBudgetHealth,
  daysBetween,
  deriveTransactions,
  detectUpcoming,
  detectedFixedCosts,
  filterTransactions,
  fixedRhythm,
  groupTransactionsByFlag,
  investedYtdCents,
  latestTransactions,
  listPastReports,
  monthlyFlows,
  monthsBetweenBudget,
  nextInstallmentSuggestion,
  paceMonths,
  paidInstallmentInMonth,
  planProgress,
  portfolioReturn,
  priorBudgetMonth,
  readReturn,
  recentlyAdded,
  shiftBudgetMonth,
  sortedMonths,
  splitGap,
  unpaidExpenseCents,
} from '../domain/engine'
import { groupTransactions } from '../domain/engine/recurringDetect'
import { makeTxn } from '../domain/engine/recurringTestHelpers'
import { makeTransaction, makeWealthAccount, makeWealthCheckin } from './factories'
import { samplePlan } from './samplePlan'
import { syntheticLedger } from './syntheticLedger'

const TODAY = '2026-09-15'
const OPEN_MONTH = '2026-09'
const SUMMED_ID_BASE = 1_000_000

/**
 * The rows the engines read by link or by exact date, so they have to stay real: investments
 * (portfolio return, gap split), rows tied to a plan, flag or settlement, and the payments that
 * settled rows (a past report is read back from them).
 */
function isPinned(t: Transaction, payments: Set<number>): boolean {
  return (
    t.type === 'investment' ||
    t.planId != null ||
    t.flagId != null ||
    t.settledBy != null ||
    payments.has(t.id) ||
    (t.reportCount ?? 0) > 0
  )
}

interface Window {
  /** Which budget months keep their real rows. */
  keep: (month: string) => boolean
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

function compact(ds: ExpenseDataset, win: Window): ExpenseDataset {
  const payments = new Set(ds.transactions.flatMap((t) => (t.settledBy != null ? [t.settledBy] : [])))
  const real: Transaction[] = []
  const cells = new Map<string, StoredTransaction>()
  for (const t of ds.transactions) {
    if (win.keep(t.budgetMonth) || (win.pin && isPinned(t, payments))) {
      real.push(t)
      continue
    }
    const key = [t.budgetMonth, t.accountId, t.categoryId, t.type, t.cancelled, Math.sign(t.amountCents)].join('|')
    const cell = cells.get(key)
    if (cell) cell.amountCents += t.amountCents
    else {
      cells.set(key, {
        id: SUMMED_ID_BASE + cells.size,
        date: `${t.budgetMonth}-01`,
        budgetMonth: t.budgetMonth,
        description: '',
        accountId: t.accountId,
        categoryId: t.categoryId,
        type: t.type,
        amountCents: t.amountCents,
        cancelled: t.cancelled,
      })
    }
  }
  const summed = deriveTransactions([...cells.values()], ds.accounts, ds.accountStatements).map((t) => ({
    ...t,
    labelIds: [] as number[],
  }))
  const transactions = [...real, ...summed].sort((a, b) =>
    a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
  )
  return { ...ds, transactions }
}

/** Maps and sets in a stable order, so two outputs compare by value. */
function plain(v: unknown): unknown {
  if (v instanceof Map) {
    return [...v.entries()]
      .map(([k, x]) => [plain(k), plain(x)])
      .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])))
  }
  if (v instanceof Set) return [...v].sort().map(plain)
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => typeof x !== 'function')
        .map(([k, x]) => [k, plain(x)]),
    )
  }
  return v
}

type Outputs = Record<string, () => unknown>

const BASES: AnalyticsBasis[] = ['committed', 'paid']
const PERIODS: AnalyticsPeriod[] = ['month', 'ytd', 'last12']
const COMPARES: CompareMode[] = ['prevMonth', 'avg3', 'prevYear']

/**
 * Each consumer in docs/ENGINE-HISTORY.md, run the way the screen runs it. The classifier always comes
 * from the full ledger because a window cannot rebuild it. Four engines build their own from the rows
 * they are given (spending groups, group detail, the pace envelope and fixed costs); the ones whose
 * output changes on a window are the `groupsByFixedFlexible`, `detailByFixedFlexible` and `fixedCosts` keys.
 */
function outputs(ds: ExpenseDataset, viewed: string, classifier: ReturnType<typeof classifyFixedSpend>): Outputs {
  const tx = ds.transactions
  const months = sortedMonths(tx.map((t) => t.budgetMonth))
  const cats = ds.categories
  const rolloverDay = ds.settings.budgetRolloverDay
  const cashRows = () => computeCashReconciliation(tx, ds.accounts, ds.settings, ds.cashActuals)
  const prev = priorBudgetMonth(viewed)
  const base = { month: viewed, today: TODAY, openMonth: OPEN_MONTH, rolloverDay }
  const out: Outputs = {
    categoryActuals: () => computeCategoryActuals(tx, cats, { includeForecast: true, ytdThroughMonth: viewed }),
    budgetHealth: () => computeBudgetHealth(tx, cats, viewed, { includeForecast: true }),
    ytdBudgetHealth: () => computeYtdBudgetHealth(tx, cats, viewed, { includeForecast: true }),
    investedYtd: () => investedYtdCents(computeMonthlyTotals(tx), viewed),
    yearlyOverview: () => computeYearlyOverview(tx, ds.settings),
    cashRows,
    balancesAtCost: () => balancesAtCost(cashRows(), ds.settings, tx, viewed),
    statementPayments: () =>
      buildStatementPayments(ds.accountStatements, cashRows(), ds.accounts, ds.settings.defaultAccountId),
    cashReserveSpend: () => averageMonthlySpendCents(tx, OPEN_MONTH),
    paceMonths: () => paceMonths(monthlyFlows(computeMonthlyTotals(tx)), '2023-04-10', OPEN_MONTH),
    unpaid: () => months.map((m) => unpaidExpenseCents(tx, m)),
    allocation: () => computeAllocation(tx, classifier, viewed, 'committed'),
    pace: () =>
      computeSpendingPace(tx, cats, ds.installmentPlans, classifier, {
        ...base,
        basis: 'committed',
        prevMonth: months.includes(prev) ? prev : null,
      }),
    movers: () => computeMovers(tx, cats, classifier, { ...base, months, basis: 'committed' }),
    groupsByCategory: () =>
      computeSpendingGroups(
        { transactions: tx, categories: cats, labels: ds.labels },
        { ...base, months, basis: 'committed', groupBy: 'category' },
      ),
    groupsByFixedFlexible: () =>
      computeSpendingGroups(
        { transactions: tx, categories: cats, labels: ds.labels },
        { ...base, months, basis: 'committed', groupBy: 'fixedFlexible' },
      ),
    groupsByLabel: () =>
      computeSpendingGroups(
        { transactions: tx, categories: cats, labels: ds.labels },
        { ...base, months, basis: 'committed', groupBy: 'label' },
      ),
    groupsByDescription: () =>
      computeSpendingGroups(
        { transactions: tx, categories: cats, labels: ds.labels },
        { ...base, months, basis: 'committed', groupBy: 'description' },
      ),
    detailByFixedFlexible: () =>
      computeSpendingGroupDetail({ transactions: tx, categories: cats }, { ...base, months, basis: 'committed', groupBy: 'fixedFlexible', key: 'fixed' }),
    detailByLabel: () =>
      computeSpendingGroupDetail({ transactions: tx, categories: cats }, { ...base, months, basis: 'committed', groupBy: 'label', key: '1' }),
    detailByDescription: () =>
      computeSpendingGroupDetail({ transactions: tx, categories: cats }, { ...base, months, basis: 'committed', groupBy: 'description', key: 'rent' }),
    fixedCosts: () => detectedFixedCosts(tx, ds.installmentPlans, cats, viewed),
    latestEight: () => latestTransactions(tx),
    recentlyAdded: () => recentlyAdded(tx),
    listAll: () => filterTransactions(tx, {}),
  }
  for (const basis of BASES) {
    out[`monthlyTotals:${basis}`] = () => [...computeMonthlyTotals(tx, { includeForecast: basis === 'committed' }).values()]
    out[`baseline:${basis}`] = () =>
      computeSpendingBaseline(tx, ds.installmentPlans, [], { months, month: viewed, basis })
    for (const period of PERIODS) {
      for (const compare of COMPARES) {
        out[`kpis:${period}:${compare}:${basis}`] = () =>
          computeOverviewKpis(tx, { ...base, months, period, compare, basis })
      }
    }
  }
  return out
}

const SUMS_ONLY = [
  'monthlyTotals:committed',
  'monthlyTotals:paid',
  'categoryActuals',
  'budgetHealth',
  'ytdBudgetHealth',
  'investedYtd',
  'yearlyOverview',
  'cashRows',
  'balancesAtCost',
  'statementPayments',
  'cashReserveSpend',
  'paceMonths',
  'unpaid',
  'baseline:committed',
  'baseline:paid',
]

const KPI_KEYS = BASES.flatMap((b) => PERIODS.flatMap((p) => COMPARES.map((c) => `kpis:${p}:${c}:${b}`)))

function sameOutput(ds: ExpenseDataset, viewed: string, win: Window, keys: string[]): string[] {
  const classifier = classifyFixedSpend(ds.transactions)
  const full = outputs(ds, viewed, classifier)
  const small = outputs(compact(ds, win), viewed, classifier)
  return keys.filter((k) => JSON.stringify(plain(full[k]!())) !== JSON.stringify(plain(small[k]!())))
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
    const ROW_READERS = [
      'allocation',
      'pace',
      'movers',
      'groupsByCategory',
      'groupsByLabel',
      'groupsByDescription',
      'detailByLabel',
      'detailByDescription',
      ...KPI_KEYS,
    ]
    const withRows = (ds: ExpenseDataset, viewed: string, count: number) =>
      sameOutput(ds, viewed, { keep: dataMonthWindow(ds, viewed, count), pin: true }, ROW_READERS)

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
        sameOutput(gapped, OPEN_MONTH, { keep: calendarWindow(OPEN_MONTH, back), pin: true }, ROW_READERS)
      expect(calendar(13)).not.toEqual([])
    })
  })

  it('pinning is what keeps the link-based and exact-date consumers whole', () => {
    const linked = ['portfolioReturn', 'readReturn', 'splitGap', 'flagGroups', 'pastReports', 'links', 'planProgress']
    const run = (pin: boolean) => {
      const small = compact(ledger, { keep: calendarWindow('2025-06', 13), pin })
      const read = (ds: ExpenseDataset) => {
        const tx = ds.transactions
        const plan = samplePlan({ planStartDate: '2022-01-01', startInvestedCents: 1_500_000, monthlyContributionCents: 80_000 })
        const links = buildReimbursementLinks(tx)
        return {
          portfolioReturn: portfolioReturn(ds.wealthCheckins, ds.wealthAccounts, tx),
          readReturn: readReturn(ds.wealthCheckins, ds.wealthAccounts, tx, plan),
          splitGap: splitGap(plan, ds.wealthCheckins, ds.wealthAccounts, tx, 0.02),
          flagGroups: groupTransactionsByFlag(tx, ds.flags),
          pastReports: listPastReports(tx, ds.flags),
          links: tx.filter((t) => t.reportCount).map((t) => links.settledBy(t.id).map((r) => r.id)),
          planProgress: ds.installmentPlans.map((p) => planProgress(p, tx)),
          installments: ds.installmentPlans.map((p) => [
            paidInstallmentInMonth(p, tx, '2025-06'),
            nextInstallmentSuggestion(p, tx, '2025-06'),
          ]),
        }
      }
      const a = plain(read(ledger)) as Record<string, unknown>
      const b = plain(read(small)) as Record<string, unknown>
      return [...linked, 'installments'].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    }
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
