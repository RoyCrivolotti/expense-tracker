import { describe, expect, it } from 'vitest'
import {
  splitInstallmentCents,
  budgetMonthForIndex,
  expectedIndexForMonth,
  finalBudgetMonth,
  nextInstallmentSuggestion,
  planProgress,
} from './installments'
import type { InstallmentPlan, StoredTransaction } from '../types'

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
    date: `2026-01-15`,
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
