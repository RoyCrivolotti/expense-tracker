import type { NewInstallmentPlan, NewTransaction } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'
import type { InstallmentIntent } from './installmentIntent'

/** Day-of-month (1-31) from an ISO date, or null when unparseable. */
function dueDayFromDate(isoDate: string): number | null {
  const day = Number(isoDate.split('-')[2])
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

/** Build a new plan anchored to the transaction being saved. */
function planFromInput(
  input: NewTransaction,
  totalCount: number,
  startIndex: number,
): NewInstallmentPlan {
  return {
    description: input.description,
    amountCents: Math.abs(input.amountCents),
    totalCount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: input.type,
    anchorBudgetMonth: input.budgetMonth,
    startInstallmentIndex: startIndex,
    dueDayOfMonth: dueDayFromDate(input.date),
    active: true,
  }
}

/**
 * Create a plan and link a transaction to it in one step. If linking fails
 * after the plan is created, delete the plan so we don't leave an orphan with
 * no payments (best-effort: a cleanup failure is logged, not thrown, so the
 * caller still surfaces the original error).
 */
async function createPlanAndLink(
  actions: ExpenseActions,
  input: NewTransaction,
  intent: Extract<InstallmentIntent, { kind: 'new' }>,
  link: (planId: number) => Promise<void>,
): Promise<void> {
  const plan = await actions.createInstallmentPlan(
    planFromInput(input, intent.totalCount, intent.installmentIndex),
  )
  try {
    await link(plan.id)
  } catch (error) {
    try {
      await actions.deleteInstallmentPlan(plan.id)
    } catch (cleanupError) {
      console.error('Failed to roll back orphaned installment plan', cleanupError)
    }
    throw error
  }
}

/** Create a transaction, applying whatever installment intent the form collected. */
export async function createTransactionWithIntent(
  actions: ExpenseActions,
  input: NewTransaction,
  intent?: InstallmentIntent,
): Promise<void> {
  if (intent?.kind === 'new') {
    await createPlanAndLink(actions, input, intent, (planId) =>
      actions.createTransaction({ ...input, planId, installmentIndex: intent.installmentIndex }),
    )
    return
  }
  if (intent?.kind === 'link') {
    await actions.createTransaction({
      ...input,
      planId: intent.planId,
      installmentIndex: intent.installmentIndex,
    })
    return
  }
  await actions.createTransaction(input)
}

/** Update a transaction, applying whatever installment intent the form collected. */
export async function updateTransactionWithIntent(
  actions: ExpenseActions,
  id: number,
  input: NewTransaction,
  intent?: InstallmentIntent,
): Promise<void> {
  if (intent?.kind === 'new') {
    await createPlanAndLink(actions, input, intent, (planId) =>
      actions.updateTransaction(id, { ...input, planId, installmentIndex: intent.installmentIndex }),
    )
    return
  }
  if (intent?.kind === 'link') {
    await actions.updateTransaction(id, {
      ...input,
      planId: intent.planId,
      installmentIndex: intent.installmentIndex,
    })
    return
  }
  if (intent?.kind === 'unlink') {
    await actions.updateTransaction(id, { ...input, planId: null })
    return
  }
  await actions.updateTransaction(id, input)
}
