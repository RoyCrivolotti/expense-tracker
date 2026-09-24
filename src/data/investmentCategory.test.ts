import { describe, expect, it } from 'vitest'
import { resolveInvestmentCategoryId } from './investmentCategory'
import { defaultExpenseSettings } from '../domain/engine'
import type { Category } from '../domain/types'

const categories: Category[] = [
  { id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
  { id: 2, name: 'ETF investing', monthlyBudgetCents: 0, sortOrder: 1, active: true },
  { id: 3, name: 'Old investments', monthlyBudgetCents: 0, sortOrder: 2, active: false },
]

describe('resolveInvestmentCategoryId', () => {
  it('takes the chosen category while it is live', () => {
    expect(resolveInvestmentCategoryId(categories, { ...defaultExpenseSettings(), investmentCategoryId: 1 })).toBe(1)
    // An archived choice no longer counts.
    expect(resolveInvestmentCategoryId(categories, { ...defaultExpenseSettings(), investmentCategoryId: 3 })).toBe(2)
  })

  it('falls back to a live category named for investments, and otherwise to none', () => {
    expect(resolveInvestmentCategoryId(categories, defaultExpenseSettings())).toBe(2)
    expect(resolveInvestmentCategoryId([categories[0]!], defaultExpenseSettings())).toBeNull()
  })
})
