import type { NewInstallmentPlan } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { InstallmentPlan } from '../types'

const YEAR_MONTH = /^\d{4}-\d{2}$/

function validateDueDay(dueDay: number | null | undefined): void {
  if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    throw new Error('dueDayOfMonth must be between 1 and 31')
  }
}

function validatePlanNumbers(input: NewInstallmentPlan): void {
  if (!Number.isInteger(input.totalCount) || input.totalCount < 1) {
    throw new Error('totalCount must be a positive integer')
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new Error('amountCents must be greater than zero')
  }
  if (!input.accountId || !input.categoryId) {
    throw new Error('accountId and categoryId are required')
  }
  const start = input.startInstallmentIndex
  if (!Number.isInteger(start) || start < 1 || start > input.totalCount) {
    throw new Error('startInstallmentIndex must be between 1 and totalCount')
  }
  validateDueDay(input.dueDayOfMonth)
}

export function validatePlanInput(input: NewInstallmentPlan): NewInstallmentPlan {
  const description = input.description?.trim()
  if (!description) throw new Error('Description is required')
  if (!YEAR_MONTH.test(input.anchorBudgetMonth)) {
    throw new Error('anchorBudgetMonth must be YYYY-MM')
  }
  validatePlanNumbers(input)
  return { ...input, description }
}

export async function createPlan(
  repo: ExpenseRepository,
  owner: string,
  input: NewInstallmentPlan,
): Promise<InstallmentPlan> {
  return repo.createInstallmentPlan(owner, validatePlanInput(input))
}

export async function patchPlan(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewInstallmentPlan>,
): Promise<InstallmentPlan> {
  if (Object.keys(patch).length === 0) throw new Error('Empty patch')
  validateDueDay(patch.dueDayOfMonth)
  return repo.updateInstallmentPlan(owner, id, patch)
}

export async function removePlan(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteInstallmentPlan(owner, id)
}
