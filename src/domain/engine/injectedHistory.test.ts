import { describe, expect, it } from 'vitest'
import type { Category, InstallmentPlan, Transaction } from '../types'
import { detectedFixedCosts } from './fixedCosts'
import { classifyFixedSpend, recurringFixedGroups } from './fixedFlexible'
import { makeTxn, monthlyDates } from './recurringTestHelpers'
import { computeSpendingGroupDetail } from './spendingGroupDetail'
import { computeSpendingGroups } from './spendingGroups'
import { computeSpendingPace, expectedFixedCents } from './spendingPace'

/**
 * A caller that holds only some of the history cannot rebuild the classifier or the recurring series: a
 * series needs three rows, and its regularity runs over every gap. Each engine takes the ones built
 * from all of it as an optional argument, and gives the answer it gives over every row.
 */
const categories: Category[] = [{ id: 1, name: 'Home', monthlyBudgetCents: 50_000, sortOrder: 0, active: true }]
const plans: InstallmentPlan[] = []

/** A gym fee on the 5th of six months, and one coffee in each of the last two. */
const all: Transaction[] = [
  ...monthlyDates(2026, 1, 5, 6).map((date, i) => makeTxn({ id: i + 1, date, description: 'Gym', amountCents: 3_000 })),
  makeTxn({ id: 20, date: '2026-05-09', description: 'Coffee', amountCents: 400 }),
  makeTxn({ id: 21, date: '2026-06-09', description: 'Coffee', amountCents: 500 }),
]
/** The last two months: two gym rows, which are not a series. */
const recent = all.filter((t) => t.budgetMonth >= '2026-05')
const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const whole = classifyFixedSpend(all)

const options = { months, month: '2026-06', basis: 'committed' as const, today: '2026-09-01' }
const fixedFlexible = { ...options, groupBy: 'fixedFlexible' as const }
const centsByKey = (rows: { key: string; currentCents: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.key, r.currentCents]))

describe('a classifier built from all the history', () => {
  it('sees what the last two months cannot: two rows are not a series', () => {
    expect(classifyFixedSpend(recent).isFixed(recent[0]!)).toBe(false)
    expect(whole.isFixed(recent[0]!)).toBe(true)
  })

  it('is optional for the spending groups, and the default is the classifier of the rows given', () => {
    const args = { transactions: all, categories, labels: [] }
    const standard = computeSpendingGroups(args, fixedFlexible)
    expect(computeSpendingGroups({ ...args, classifier: whole }, fixedFlexible)).toEqual(standard)
    expect(centsByKey(standard)).toEqual({ fixed: 3_000, flexible: 500 })
  })

  it('lets the groups of the last two months match the groups of the whole history', () => {
    const args = { transactions: recent, categories, labels: [] }
    expect(centsByKey(computeSpendingGroups(args, fixedFlexible))).toEqual({ flexible: 3_500 })
    const injected = computeSpendingGroups({ ...args, classifier: whole }, fixedFlexible)
    expect(centsByKey(injected)).toEqual({ fixed: 3_000, flexible: 500 })
  })

  it('is optional for the group detail, and lets the last two months match the whole history', () => {
    const detail = (transactions: Transaction[], classifier?: ReturnType<typeof classifyFixedSpend>) =>
      computeSpendingGroupDetail(
        { transactions, categories, ...(classifier ? { classifier } : {}) },
        { ...options, groupBy: 'fixedFlexible', key: 'fixed' },
      ).history.map((h) => h.actualCents)
    expect(detail(all)).toEqual([3_000, 3_000, 3_000, 3_000, 3_000, 3_000])
    expect(detail(all, whole)).toEqual(detail(all))
    expect(detail(recent)).toEqual([0, 0, 0, 0, 0, 0])
    expect(detail(recent, whole)).toEqual([0, 0, 0, 0, 3_000, 3_000])
  })
})

describe('the recurring series of all the history', () => {
  const series = recurringFixedGroups(all)

  it('is optional for the expected fixed charges, and the default is the series of the rows given', () => {
    expect(expectedFixedCents(all, plans, categories, '2026-06')).toBe(3_000)
    expect(expectedFixedCents(all, plans, categories, '2026-06', series)).toBe(3_000)
  })

  it('lets the last two months expect the fixed charges the whole history does', () => {
    expect(expectedFixedCents(recent, plans, categories, '2026-06')).toBe(0)
    expect(expectedFixedCents(recent, plans, categories, '2026-06', series)).toBe(3_000)
  })

  it('takes an empty series to mean no series, not a missing one', () => {
    expect(expectedFixedCents(all, plans, categories, '2026-06', [])).toBe(0)
  })

  it('is optional for the fixed cost list, and lets the last two months list what the whole history does', () => {
    const names = (rows: { name: string; inPaceBudget: boolean }[]) => rows.map((r) => [r.name, r.inPaceBudget])
    expect(names(detectedFixedCosts(all, plans, categories, '2026-06'))).toEqual([['Gym', true]])
    expect(detectedFixedCosts(recent, plans, categories, '2026-06')).toEqual([])
    expect(detectedFixedCosts(recent, plans, categories, '2026-06', series)).toEqual(
      detectedFixedCosts(all, plans, categories, '2026-06'),
    )
  })

  it('reaches the spending pace through its options', () => {
    const pace = (transactions: Transaction[], fixedGroups?: typeof series) =>
      computeSpendingPace(transactions, categories, plans, whole, {
        month: '2026-06',
        today: '2026-09-01',
        basis: 'committed',
        prevMonth: '2026-05',
        ...(fixedGroups ? { fixedGroups } : {}),
      })
    expect(pace(all).flexibleBudgetCents).toBe(47_000)
    expect(pace(recent).flexibleBudgetCents).toBe(50_000)
    expect(pace(recent, series)).toEqual(pace(all))
  })
})
