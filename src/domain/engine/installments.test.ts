import { describe, expect, it } from 'vitest'
import {
  splitInstallmentCents,
  budgetMonthForIndex,
  calendarOffsetMonths,
  expectedIndexForMonth,
  finalBudgetMonth,
  forecastPaidCount,
  nextInstallmentSuggestion,
  planProgress,
} from './installments'
import type { InstallmentPlan, StoredTransaction, Transaction } from '../types'

const plan: InstallmentPlan = {
  id: 1,
  description: 'Iphone, Cetelam',
  totalCount: 24,
  amountCents: 5783,
  accountId: 3,
  categoryId: 4,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 14,
  active: true,
}

function linked(index: number, overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: index,
    date: `${budgetMonthForIndex(plan, index)}-15`,
    budgetMonth: budgetMonthForIndex(plan, index),
    description: plan.description,
    accountId: plan.accountId,
    categoryId: plan.categoryId,
    type: plan.type,
    amountCents: plan.amountCents,
    cancelled: false,
    planId: plan.id,
    installmentIndex: index,
    ...overrides,
  }
}

describe('installment schedule maths', () => {
  it('maps index to budget month by offset from the anchor', () => {
    expect(budgetMonthForIndex(plan, 14)).toBe('2026-01')
    expect(budgetMonthForIndex(plan, 15)).toBe('2026-02')
    expect(budgetMonthForIndex(plan, 24)).toBe('2026-11')
  })

  it('inverts month back to expected index', () => {
    expect(expectedIndexForMonth(plan, '2026-01')).toBe(14)
    expect(expectedIndexForMonth(plan, '2026-11')).toBe(24)
  })

  it('computes the final budget month from totalCount', () => {
    expect(finalBudgetMonth(plan)).toBe('2026-11')
  })
})

describe('planProgress', () => {
  it('reports startIndex-1 as lastIndex when nothing recorded', () => {
    const p = planProgress(plan, [])
    expect(p.paidCount).toBe(0)
    expect(p.lastIndex).toBe(13)
    expect(p.nextIndex).toBe(14)
    expect(p.remaining).toBe(11)
    expect(p.complete).toBe(false)
  })

  it('tracks the highest recorded index and ignores cancelled', () => {
    const p = planProgress(plan, [linked(14), linked(15), linked(16, { cancelled: true })])
    expect(p.paidCount).toBe(2)
    expect(p.lastIndex).toBe(15)
    expect(p.nextIndex).toBe(16)
  })

  it('marks complete when the final index is recorded', () => {
    const p = planProgress(plan, [linked(24)])
    expect(p.complete).toBe(true)
    expect(p.remaining).toBe(0)
  })
})

function linkedTxn(
  index: number,
  status: Transaction['status'],
  overrides: Partial<StoredTransaction> = {},
): Transaction {
  return { ...linked(index, overrides), status }
}

describe('forecastPaidCount', () => {
  it('returns 0 when the plan has no linked transactions', () => {
    expect(forecastPaidCount(plan, [])).toBe(0)
  })

  it('counts only linked, non-cancelled, forecast transactions', () => {
    const txns = [
      linkedTxn(14, 'forecast'),
      linkedTxn(15, 'posted'),
      linkedTxn(16, 'forecast', { cancelled: true }),
      linkedTxn(17, 'forecast', { planId: 99 }),
    ]
    expect(forecastPaidCount(plan, txns)).toBe(1)
  })
})

describe('nextInstallmentSuggestion', () => {
  it('suggests the next unpaid installment', () => {
    const s = nextInstallmentSuggestion(plan, [linked(14)])
    expect(s?.installmentIndex).toBe(15)
    expect(s?.budgetMonth).toBe('2026-02')
    expect(s?.amountCents).toBe(5783)
    expect(s?.predictedDate).toBe('2026-02-01')
  })

  it('uses a month placeholder with dueDateKnown=false for legacy plans', () => {
    const s = nextInstallmentSuggestion(plan, [linked(14)])
    expect(s?.dueDateKnown).toBe(false)
    expect(s?.predictedDate).toBe('2026-02-01')
  })

  it('uses the real due day with dueDateKnown=true when set', () => {
    const s = nextInstallmentSuggestion({ ...plan, dueDayOfMonth: 8 }, [linked(14)])
    expect(s?.dueDateKnown).toBe(true)
    expect(s?.predictedDate).toBe('2026-02-08')
  })

  it('clamps the due day to the days in the budget month', () => {
    const s = nextInstallmentSuggestion({ ...plan, dueDayOfMonth: 31 }, [linked(14)])
    expect(s?.predictedDate).toBe('2026-02-28')
  })

  it('returns null when complete or inactive', () => {
    expect(nextInstallmentSuggestion(plan, [linked(24)])).toBeNull()
    expect(nextInstallmentSuggestion({ ...plan, active: false }, [])).toBeNull()
  })

  it('filters to the viewed budget month when requested', () => {
    expect(nextInstallmentSuggestion(plan, [linked(14)], '2026-03')).toBeNull()
    expect(nextInstallmentSuggestion(plan, [linked(14)], '2026-02')?.installmentIndex).toBe(15)
  })
})

describe('charge dates when the calendar month differs from the budget month', () => {
  const datedPlan: InstallmentPlan = { ...plan, dueDayOfMonth: 6 }

  /** A recorded installment of any plan, dated as given, counted in its scheduled budget month. */
  function recorded(
    p: InstallmentPlan,
    index: number,
    date: string,
    overrides: Partial<StoredTransaction> = {},
  ): StoredTransaction {
    return { ...linked(index, { date, budgetMonth: budgetMonthForIndex(p, index), ...overrides }), planId: p.id }
  }

  it('dates the next installment a month before its budget month when the first was', () => {
    const s = nextInstallmentSuggestion(datedPlan, [recorded(datedPlan, 14, '2025-12-06')])
    expect(s?.budgetMonth).toBe('2026-02')
    expect(s?.predictedDate).toBe('2026-01-06')
  })

  it('keeps the budget month when the first installment was dated in it', () => {
    const s = nextInstallmentSuggestion(datedPlan, [recorded(datedPlan, 14, '2026-01-06')])
    expect(s?.predictedDate).toBe('2026-02-06')
  })

  it('follows a first installment dated after its budget month', () => {
    const s = nextInstallmentSuggestion(datedPlan, [recorded(datedPlan, 14, '2026-02-06')])
    expect(s?.budgetMonth).toBe('2026-02')
    expect(s?.predictedDate).toBe('2026-03-06')
  })

  it('carries the shift across a year boundary', () => {
    const yearPlan: InstallmentPlan = {
      ...datedPlan,
      anchorBudgetMonth: '2025-12',
      startInstallmentIndex: 1,
      totalCount: 3,
    }
    const s = nextInstallmentSuggestion(yearPlan, [recorded(yearPlan, 1, '2025-11-06')])
    expect(s?.budgetMonth).toBe('2026-01')
    expect(s?.predictedDate).toBe('2025-12-06')
  })

  it('clamps the due day to the shifted month, including leap years', () => {
    const clampPlan = (anchor: string): InstallmentPlan => ({
      ...datedPlan,
      anchorBudgetMonth: anchor,
      startInstallmentIndex: 1,
      totalCount: 3,
      dueDayOfMonth: 31,
    })
    const leap = clampPlan('2028-02')
    const common = clampPlan('2027-02')
    expect(nextInstallmentSuggestion(leap, [recorded(leap, 1, '2028-01-31')])?.predictedDate).toBe('2028-02-29')
    expect(nextInstallmentSuggestion(common, [recorded(common, 1, '2027-01-31')])?.predictedDate).toBe('2027-02-28')
  })

  it('reads the shift from the earliest installment, not a later one', () => {
    const s = nextInstallmentSuggestion(datedPlan, [
      recorded(datedPlan, 14, '2025-12-06'),
      recorded(datedPlan, 15, '2026-02-06'),
    ])
    expect(s?.budgetMonth).toBe('2026-03')
    expect(s?.predictedDate).toBe('2026-02-06')
  })

  it('skips a cancelled first installment when finding the reference', () => {
    const s = nextInstallmentSuggestion(datedPlan, [
      recorded(datedPlan, 14, '2025-12-06', { cancelled: true }),
      recorded(datedPlan, 15, '2026-02-06'),
    ])
    expect(s?.predictedDate).toBe('2026-03-06')
  })

  it('is not moved by relabelling the reference installment\'s budget month', () => {
    const s = nextInstallmentSuggestion(datedPlan, [
      recorded(datedPlan, 14, '2025-12-06', { budgetMonth: '2026-05' }),
    ])
    expect(s?.predictedDate).toBe('2026-01-06')
  })

  it('leaves the month placeholder alone when the plan has no due day', () => {
    const s = nextInstallmentSuggestion(plan, [recorded(plan, 14, '2025-12-06')])
    expect(s?.dueDateKnown).toBe(false)
    expect(s?.predictedDate).toBe('2026-02-01')
  })

  it('predicts within the budget month when nothing is recorded yet', () => {
    expect(nextInstallmentSuggestion(datedPlan, [])?.predictedDate).toBe('2026-01-06')
  })

  it('ignores a gap of more than a month as a likely typo', () => {
    const s = nextInstallmentSuggestion(datedPlan, [recorded(datedPlan, 14, '2025-10-06')])
    expect(s?.predictedDate).toBe('2026-02-06')
  })
})

describe('calendarOffsetMonths', () => {
  it('is 0 with nothing recorded', () => {
    expect(calendarOffsetMonths(plan, [])).toBe(0)
  })

  it('counts months from the first installment\'s date to its scheduled budget month', () => {
    expect(calendarOffsetMonths(plan, [linked(14, { date: '2025-12-20' })])).toBe(1)
    expect(calendarOffsetMonths(plan, [linked(14, { date: '2026-01-02' })])).toBe(0)
    expect(calendarOffsetMonths(plan, [linked(14, { date: '2026-02-02' })])).toBe(-1)
  })

  it('ignores installments of other plans', () => {
    expect(calendarOffsetMonths(plan, [linked(14, { date: '2025-12-20', planId: 99 })])).toBe(0)
  })

  it('is 0 for a malformed date', () => {
    expect(calendarOffsetMonths(plan, [linked(14, { date: 'not-a-date' })])).toBe(0)
  })
})

describe('splitInstallmentCents', () => {
  it.each([
    [10000, 7, 1428, 4],
    [10000, 3, 3333, 1],
    [5000, 6, 833, 2],
    [9999, 3, 3333, 0],
    [1000, 1, 1000, 0],
  ])('splits %i over %i as %i with %i left over', (total, count, per, remainder) => {
    expect(splitInstallmentCents(total, count)).toEqual({
      perInstallmentCents: per,
      remainderCents: remainder,
    })
  })

  it('always reconstructs the entered total', () => {
    for (let total = 1; total <= 400; total += 7) {
      for (let count = 1; count <= 12; count++) {
        const { perInstallmentCents, remainderCents } = splitInstallmentCents(total, count)
        expect(perInstallmentCents * count + remainderCents).toBe(total)
      }
    }
  })

  it('treats a negative total as its magnitude', () => {
    expect(splitInstallmentCents(-1000, 3)).toEqual({ perInstallmentCents: 333, remainderCents: 1 })
  })

  it('falls back to the whole amount for a non-positive count', () => {
    expect(splitInstallmentCents(1000, 0)).toEqual({ perInstallmentCents: 1000, remainderCents: 0 })
  })
})
