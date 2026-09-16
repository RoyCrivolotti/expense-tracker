import type { NewInstallmentPlan } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { InstallmentPlan } from '../types'
import { ValidationError } from './validationError'

const YEAR_MONTH = /^\d{4}-\d{2}$/

export function validateDueDay(dueDay: number | null | undefined): void {
  if (dueDay != null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    throw new ValidationError('dueDayOfMonth must be between 1 and 31')
  }
}

function validateTotalCount(totalCount: number): void {
  if (!Number.isInteger(totalCount) || totalCount < 1) {
    throw new ValidationError('totalCount must be a positive integer')
  }
}

function validateAmountCents(amountCents: number): void {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new ValidationError('amountCents must be greater than zero')
  }
}

/** `totalCount` is the upper bound when the caller supplies one. */
function validateStartIndex(start: number, totalCount?: number): void {
  if (!Number.isInteger(start) || start < 1) {
    throw new ValidationError('startInstallmentIndex must be between 1 and totalCount')
  }
  if (totalCount != null && start > totalCount) {
    throw new ValidationError('startInstallmentIndex must be between 1 and totalCount')
  }
}

function validatePlanNumbers(input: NewInstallmentPlan): void {
  validateTotalCount(input.totalCount)
  validateAmountCents(input.amountCents)
  if (!input.accountId || !input.categoryId) {
    throw new ValidationError('accountId and categoryId are required')
  }
  validateStartIndex(input.startInstallmentIndex, input.totalCount)
  validateDueDay(input.dueDayOfMonth)
}

/**
 * The same numeric rules creation enforces, applied to whichever fields a patch
 * carries. Editing used to check only `dueDayOfMonth`, so a plan created with a
 * positive amount over a whole number of installments could be edited to neither.
 *
 * The one rule this cannot fully reach is `startInstallmentIndex <= totalCount` when
 * the patch moves the index without restating the count: the stored count is not in
 * hand here and the port has no single-plan read. The edit form always sends both, so
 * the gap is a hand-written patch, not a path the app takes.
 */
function validatePlanPatchNumbers(patch: Partial<NewInstallmentPlan>): void {
  if (patch.totalCount !== undefined) validateTotalCount(patch.totalCount)
  if (patch.amountCents !== undefined) validateAmountCents(patch.amountCents)
  if (patch.startInstallmentIndex !== undefined) {
    validateStartIndex(patch.startInstallmentIndex, patch.totalCount)
  }
  validateDueDay(patch.dueDayOfMonth)
}

export function validatePlanInput(input: NewInstallmentPlan): NewInstallmentPlan {
  const description = input.description?.trim()
  if (!description) throw new ValidationError('Description is required')
  if (!YEAR_MONTH.test(input.anchorBudgetMonth)) {
    throw new ValidationError('anchorBudgetMonth must be YYYY-MM')
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
  if (Object.keys(patch).length === 0) throw new ValidationError('Empty patch')
  validatePlanPatchNumbers(patch)
  return repo.updateInstallmentPlan(owner, id, patch)
}

export async function removePlan(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteInstallmentPlan(owner, id)
}
