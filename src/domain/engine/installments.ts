/**
 * Pure installment-plan logic: schedule maths and progress, with no I/O. A plan
 * is anchored by `anchorBudgetMonth` (the budget month of its
 * `startInstallmentIndex` payment); every other installment's budget month is
 * that anchor shifted by the index offset.
 */
import type { InstallmentPlan, StoredTransaction, Transaction, TxnType } from '../types'
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
  /** Suggested calendar date to seed the transaction. */
  predictedDate: string
  /** Whether `predictedDate` reflects a real due day (vs. a month placeholder). */
  dueDateKnown: boolean
}

/** ISO date for `dueDayOfMonth` within `budgetMonth`, clamped to the month length. */
function dueDateInMonth(budgetMonth: string, dueDayOfMonth: number): string {
  const [y, m] = budgetMonth.split('-').map(Number) as [number, number]
  const maxDay = new Date(y, m, 0).getDate()
  const day = Math.min(Math.max(dueDayOfMonth, 1), maxDay)
  return `${budgetMonth}-${String(day).padStart(2, '0')}`
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

export interface PaidInstallment {
  transaction: Transaction
  installmentIndex: number
}

/** Linked, non-cancelled installments logged but not yet settled (status 'forecast'). */
export function forecastPaidCount(plan: InstallmentPlan, transactions: Transaction[]): number {
  return transactions.filter((t) => t.planId === plan.id && !t.cancelled && t.status === 'forecast').length
}

/**
 * The transaction that settled `plan`'s installment for `budgetMonth`, if
 * that installment has already been logged. Returns null when nothing is
 * scheduled that month (before the plan starts / after it ends), the plan is
 * inactive, or the scheduled installment hasn't been paid yet.
 */
export function paidInstallmentInMonth(
  plan: InstallmentPlan,
  transactions: Transaction[],
  budgetMonth: string,
): PaidInstallment | null {
  if (!plan.active) return null
  const installmentIndex = expectedIndexForMonth(plan, budgetMonth)
  if (installmentIndex < plan.startInstallmentIndex || installmentIndex > plan.totalCount) return null
  const transaction = transactions.find(
    (t) => t.planId === plan.id && !t.cancelled && t.installmentIndex === installmentIndex,
  )
  return transaction ? { transaction, installmentIndex } : null
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
  const dueDateKnown = plan.dueDayOfMonth != null
  const predictedDate = dueDateKnown
    ? dueDateInMonth(budgetMonth, plan.dueDayOfMonth as number)
    : `${budgetMonth}-01`
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
    predictedDate,
    dueDateKnown,
  }
}

export interface InstallmentSplit {
  /** What the plan stores, and what every later installment charges. */
  perInstallmentCents: number
  /** Leftover cents, carried by the installment being recorded now. */
  remainderCents: number
}

/**
 * Divide a total across installments without inventing or losing a cent.
 *
 * A plan stores one `amountCents` that every installment reuses, so rounding makes the
 * schedule collect the wrong total (100.00 over 7 charges 100.03). Floor, and give the
 * remainder to the installment being created now — the only one that can carry it
 * without the plan remembering the original total.
 *
 * Both the save path and the form preview must use this, or they disagree.
 */
export function splitInstallmentCents(totalCents: number, totalCount: number): InstallmentSplit {
  const magnitude = Math.abs(totalCents)
  if (totalCount <= 0) return { perInstallmentCents: magnitude, remainderCents: 0 }
  const perInstallmentCents = Math.floor(magnitude / totalCount)
  return { perInstallmentCents, remainderCents: magnitude - perInstallmentCents * totalCount }
}
