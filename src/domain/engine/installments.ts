/**
 * Pure installment-plan logic: schedule maths and progress, with no I/O. A plan
 * is anchored by `anchorBudgetMonth` (the budget month of its
 * `startInstallmentIndex` payment); every other installment's budget month is
 * that anchor shifted by the index offset.
 */
import type { InstallmentPlan, StoredTransaction, TxnType } from '../types'
import { monthsBetweenBudget, shiftBudgetMonth } from './dates'

export interface PlanProgress {
  /** Distinct installments recorded (non-cancelled linked transactions). */
  paidCount: number
  totalCount: number
  /** Highest installment index recorded, or startInstallmentIndex - 1 if none. */
  lastIndex: number
  /** Next installment index due (lastIndex + 1). */
  nextIndex: number
  /** Installments still to pay (never negative). */
  remaining: number
  complete: boolean
  /** Budget month the final installment falls due. */
  finalBudgetMonth: string
}

export interface InstallmentSuggestion {
  planId: number
  description: string
  type: TxnType
  accountId: number
  categoryId: number
  amountCents: number
  installmentIndex: number
  totalCount: number
  budgetMonth: string
  /** Suggested calendar date to seed the transaction (first of budget month). */
  predictedDate: string
}

/** Budget month a given installment index falls due. */
export function budgetMonthForIndex(plan: InstallmentPlan, index: number): string {
  return shiftBudgetMonth(plan.anchorBudgetMonth, index - plan.startInstallmentIndex)
}

/** Installment index that should be due in `budgetMonth` for this plan. */
export function expectedIndexForMonth(plan: InstallmentPlan, budgetMonth: string): number {
  return plan.startInstallmentIndex + monthsBetweenBudget(plan.anchorBudgetMonth, budgetMonth)
}

/** Budget month the last installment (totalCount) falls due. */
export function finalBudgetMonth(plan: InstallmentPlan): string {
  return budgetMonthForIndex(plan, plan.totalCount)
}

function linkedIndices(plan: InstallmentPlan, transactions: StoredTransaction[]): number[] {
  return transactions
    .filter(
      (t) =>
        t.planId === plan.id &&
        !t.cancelled &&
        typeof t.installmentIndex === 'number',
    )
    .map((t) => t.installmentIndex as number)
}

export function planProgress(
  plan: InstallmentPlan,
  transactions: StoredTransaction[],
): PlanProgress {
  const indices = linkedIndices(plan, transactions)
  const lastIndex = indices.length > 0 ? Math.max(...indices) : plan.startInstallmentIndex - 1
  const nextIndex = lastIndex + 1
  const remaining = Math.max(0, plan.totalCount - lastIndex)
  return {
    paidCount: indices.length,
    totalCount: plan.totalCount,
    lastIndex,
    nextIndex,
    remaining,
    complete: lastIndex >= plan.totalCount,
    finalBudgetMonth: finalBudgetMonth(plan),
  }
}

/**
 * The next unpaid installment for a plan, or null when the plan is inactive,
 * complete, or (with `forBudgetMonth`) not the month being viewed.
 */
export function nextInstallmentSuggestion(
  plan: InstallmentPlan,
  transactions: StoredTransaction[],
  forBudgetMonth?: string,
): InstallmentSuggestion | null {
  if (!plan.active) return null
  const progress = planProgress(plan, transactions)
  if (progress.complete) return null
  const installmentIndex = progress.nextIndex
  if (installmentIndex > plan.totalCount) return null
  const budgetMonth = budgetMonthForIndex(plan, installmentIndex)
  if (forBudgetMonth && budgetMonth !== forBudgetMonth) return null
  return {
    planId: plan.id,
    description: plan.description,
    type: plan.type,
    accountId: plan.accountId,
    categoryId: plan.categoryId,
    amountCents: plan.amountCents,
    installmentIndex,
    totalCount: plan.totalCount,
    budgetMonth,
    predictedDate: `${budgetMonth}-01`,
  }
}
