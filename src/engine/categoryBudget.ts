/**
 * Category budget vs actual — reproduces the workbook's "Category Budget vs
 * Actual" sheet. Actuals are net of refunds and only count posted expense/refund
 * transactions (income and investment types are excluded by construction).
 */
import type { Category, Transaction } from '../types'

export interface CategoryActuals {
  categoryId: number
  name: string
  monthlyBudgetCents: number
  /** Net actual per budget month (YYYY-MM -> cents). */
  byMonth: Map<string, number>
  ytdActualCents: number
}

export interface CategoryActualsOptions {
  /**
   * Count forecast (unpaid deferred-card) charges too. Default false for
   * settled/cash views; the dashboard and analytics Monthly Summary pass true so
   * they reflect total committed spend for the budget month. Cancelled
   * transactions are always excluded.
   */
  includeForecast?: boolean
}

/** Net actual spend per category per budget month, plus YTD per category. */
export function computeCategoryActuals(
  transactions: Transaction[],
  categories: Category[],
  opts: CategoryActualsOptions = {},
): CategoryActuals[] {
  const byCategory = new Map<number, CategoryActuals>()
  for (const cat of categories) {
    byCategory.set(cat.id, {
      categoryId: cat.id,
      name: cat.name,
      monthlyBudgetCents: cat.monthlyBudgetCents,
      byMonth: new Map(),
      ytdActualCents: 0,
    })
  }

  for (const txn of transactions) {
    if (txn.status === 'cancelled') continue
    if (!opts.includeForecast && txn.status === 'forecast') continue
    if (txn.type !== 'expense' && txn.type !== 'refund') continue
    const entry = byCategory.get(txn.categoryId)
    if (!entry) continue
    const signed = txn.type === 'refund' ? -txn.amountCents : txn.amountCents
    entry.byMonth.set(txn.budgetMonth, (entry.byMonth.get(txn.budgetMonth) ?? 0) + signed)
    entry.ytdActualCents += signed
  }

  return [...byCategory.values()].sort((a, b) => a.categoryId - b.categoryId)
}

export type BudgetStatus = 'under' | 'warning' | 'over'

export interface BudgetHealth {
  categoryId: number
  name: string
  budgetCents: number
  actualCents: number
  /** actual / budget; 0 when no budget is set. */
  ratio: number
  status: BudgetStatus
}

function healthStatus(ratio: number, hasBudget: boolean): BudgetStatus {
  if (!hasBudget) return 'under'
  if (ratio > 1) return 'over'
  if (ratio >= 0.8) return 'warning'
  return 'under'
}

/** Per-category health for a single budget month, for the dashboard bars. */
export function computeBudgetHealth(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  opts: CategoryActualsOptions = {},
): BudgetHealth[] {
  const actuals = computeCategoryActuals(transactions, categories, opts)
  return actuals.map((entry) => {
    const actualCents = entry.byMonth.get(month) ?? 0
    const hasBudget = entry.monthlyBudgetCents > 0
    const ratio = hasBudget ? actualCents / entry.monthlyBudgetCents : 0
    return {
      categoryId: entry.categoryId,
      name: entry.name,
      budgetCents: entry.monthlyBudgetCents,
      actualCents,
      ratio,
      status: healthStatus(ratio, hasBudget),
    }
  })
}
