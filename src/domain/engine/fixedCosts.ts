/**
 * What the Overview counts as a fixed cost, listed: the recurring patterns the detector
 * trusts and the instalment plans still running. Read-only; the point is that nobody has
 * to take the fixed/flexible split on faith. `inPaceBudget` marks the ones taken out of
 * this month's pace budget, so the list and `expectedFixedCents` can never disagree.
 */
import type { Category, InstallmentPlan, Transaction } from '../types'
import { finalBudgetMonth, budgetMonthForIndex, expectedIndexForMonth } from './installments'
import { fixedRhythm, recurringFixedGroups } from './fixedFlexible'
import { activeInMonth, budgetedCategoryIds, isMonthlyGroup } from './spendingPace'
import type { RecurringFrequency } from './recurringTypes'

export interface FixedCostItem {
  key: string
  kind: 'pattern' | 'instalment'
  name: string
  amountCents: number
  frequency: Exclude<RecurringFrequency, 'weekly'>
  /** Newest budget month the pattern was charged in; null for an instalment plan. */
  lastMonth: string | null
  /** For an instalment plan due this month: which payment it is, of how many. */
  payment: { index: number; total: number } | null
  /** Whether it is taken out of this month's flexible pace budget. */
  inPaceBudget: boolean
}

function newest(months: Set<string>): string {
  return [...months].sort().at(-1)!
}

function instalmentItems(
  plans: InstallmentPlan[],
  budgeted: Set<number>,
  month: string,
): FixedCostItem[] {
  const items: FixedCostItem[] = []
  for (const plan of plans) {
    if (!plan.active || plan.type !== 'expense') continue
    if (budgetMonthForIndex(plan, plan.startInstallmentIndex) > month) continue
    if (finalBudgetMonth(plan) < month) continue
    const index = expectedIndexForMonth(plan, month)
    const due = index >= plan.startInstallmentIndex && index <= plan.totalCount
    items.push({
      key: `plan-${plan.id}`,
      kind: 'instalment',
      name: plan.description,
      amountCents: plan.amountCents,
      frequency: 'monthly',
      lastMonth: null,
      payment: due ? { index, total: plan.totalCount } : null,
      inPaceBudget: due && budgeted.has(plan.categoryId),
    })
  }
  return items
}

/** Detected fixed costs for a budget month: what is in the pace budget first, then by size. */
export function detectedFixedCosts(
  transactions: Transaction[],
  plans: InstallmentPlan[],
  categories: Category[],
  month: string,
): FixedCostItem[] {
  const budgeted = budgetedCategoryIds(categories)
  const items = instalmentItems(plans, budgeted, month)
  for (const group of recurringFixedGroups(transactions)) {
    const frequency = fixedRhythm(group)
    if (group.key.type !== 'expense' || frequency === null) continue
    items.push({
      key: `${group.key.normalizedDesc}|${group.key.accountId}|${group.key.categoryId}`,
      kind: 'pattern',
      name: group.label,
      amountCents: group.amountCents,
      frequency,
      lastMonth: newest(group.budgetMonths),
      payment: null,
      inPaceBudget:
        budgeted.has(group.categoryId) && isMonthlyGroup(group) && activeInMonth(group, month),
    })
  }
  return items.sort(
    (a, b) => Number(b.inPaceBudget) - Number(a.inPaceBudget) || b.amountCents - a.amountCents,
  )
}
