import type { NewInstallmentPlan, NewTransaction } from '../../data/dataSource'
import type { Transaction } from '../../types'
import type { ExpenseActions } from '../actions'
import type { InstallmentIntent } from './installmentIntent'

/** Day-of-month (1-31) from an ISO date, or null when unparseable. */
function dueDayFromDate(isoDate: string): number | null {
  const day = Number(isoDate.split('-')[2])
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

/**
 * Build a new plan anchored to the transaction being saved, and the (sign-
 * preserving) amount the linked transaction itself should carry: the entered
 * amount as-is, or its share of the total when `splitTotal` is set.
 */
function planFromInput(
  input: NewTransaction,
  totalCount: number,
  startIndex: number,
  splitTotal: boolean,
): { plan: NewInstallmentPlan; amountCents: number } {
  const magnitude = Math.abs(input.amountCents)
  const perInstallmentCents = splitTotal ? Math.round(magnitude / totalCount) : magnitude
  const sign = input.amountCents < 0 ? -1 : 1
  return {
    plan: {
      description: input.description,
      amountCents: perInstallmentCents,
      totalCount,
      accountId: input.accountId,
      categoryId: input.categoryId,
      type: input.type,
      anchorBudgetMonth: input.budgetMonth,
      startInstallmentIndex: startIndex,
      dueDayOfMonth: dueDayFromDate(input.date),
      active: true,
    },
    amountCents: perInstallmentCents * sign,
  }
}

/**
 * Create a plan and link a transaction to it in one step. If linking fails
 * after the plan is created, delete the plan so we don't leave an orphan with
 * no payments (best-effort: a cleanup failure is logged, not thrown, so the
 * caller still surfaces the original error).
 */
async function createPlanAndLink<T>(
  actions: ExpenseActions,
  input: NewTransaction,
  intent: Extract<InstallmentIntent, { kind: 'new' }>,
  link: (planId: number, amountCents: number) => Promise<T>,
): Promise<T> {
  const { plan, amountCents } = planFromInput(
    input,
    intent.totalCount,
    intent.installmentIndex,
    intent.splitTotal ?? false,
  )
  const created = await actions.createInstallmentPlan(plan)
  try {
    // `return await`, deliberately: a bare `return link(...)` settles outside
    // this try, so a rejected link would skip the rollback below entirely.
    return await link(created.id, amountCents)
  } catch (error) {
    try {
      await actions.deleteInstallmentPlan(created.id)
    } catch (cleanupError) {
      console.error('Failed to roll back orphaned installment plan', cleanupError)
    }
    throw error
  }
}

/**
 * Create a transaction, applying whatever installment intent the form collected.
 *
 * Resolves with the stored row rather than void: the add form stages receipts
 * before the transaction exists, and needs the new id to upload them against.
 */
export async function createTransactionWithIntent(
  actions: ExpenseActions,
  input: NewTransaction,
  intent?: InstallmentIntent,
): Promise<Transaction> {
  if (intent?.kind === 'new') {
    return createPlanAndLink(actions, input, intent, (planId, amountCents) =>
      actions.createTransaction({
        ...input,
        amountCents,
        planId,
        installmentIndex: intent.installmentIndex,
      }),
    )
  }
  if (intent?.kind === 'link') {
    return actions.createTransaction({
      ...input,
      planId: intent.planId,
      installmentIndex: intent.installmentIndex,
    })
  }
  return actions.createTransaction(input)
}

/** Update a transaction, applying whatever installment intent the form collected. */
export async function updateTransactionWithIntent(
  actions: ExpenseActions,
  id: number,
  input: NewTransaction,
  intent?: InstallmentIntent,
): Promise<void> {
  if (intent?.kind === 'new') {
    await createPlanAndLink(actions, input, intent, (planId, amountCents) =>
      actions.updateTransaction(id, {
        ...input,
        amountCents,
        planId,
        installmentIndex: intent.installmentIndex,
      }),
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
