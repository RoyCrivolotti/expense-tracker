import type { ExpenseRepository } from '../ports/expenseRepository'
import type { NewWealthAccount, NewWealthCheckin } from '../data/dataSource'
import type { WealthAccount, WealthCheckin } from '../types'
import { ValidationError } from './validationError'

export async function createWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  input: NewWealthAccount,
): Promise<WealthAccount> {
  const name = input.name?.trim()
  if (!name) throw new ValidationError('Account name is required')
  return repo.createWealthAccount(owner, { ...input, name })
}

export async function patchWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewWealthAccount>,
): Promise<WealthAccount> {
  if (Object.keys(patch).length === 0) throw new ValidationError('Empty patch')
  return repo.updateWealthAccount(owner, id, patch)
}

export async function removeWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteWealthAccount(owner, id)
}

/** No account holds more than this, in cents (a hundred billion euros), either way: a debt is a balance below zero. */
const MAX_BALANCE_CENTS = 1e13

/**
 * The balances of a check-in: a list of an account and a whole number of cents each. Nothing past the ceiling and nothing
 * that is not a number, which would otherwise be stored and then summed into the net worth. Negative is a balance, since
 * an overdrawn account has one.
 */
function assertEntries(entries: unknown): void {
  if (!Array.isArray(entries)) throw new ValidationError('entries must be an array')
  for (const entry of entries as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new ValidationError('each of the entries must be an object with accountId and valueCents')
    const { accountId, valueCents } = entry as Record<string, unknown>
    if (!Number.isInteger(accountId)) throw new ValidationError('entries: accountId must be a whole number')
    if (!Number.isSafeInteger(valueCents) || Math.abs(valueCents as number) > MAX_BALANCE_CENTS) {
      throw new ValidationError('entries: valueCents must be a whole number of cents, a hundred billion euros at most either way')
    }
  }
}

export async function createWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  input: NewWealthCheckin,
): Promise<WealthCheckin> {
  if (!input.checkinDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new ValidationError('checkinDate must be YYYY-MM-DD')
  }
  assertEntries(input.entries)
  return repo.createWealthCheckin(owner, input)
}

export async function patchWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewWealthCheckin>,
): Promise<WealthCheckin> {
  if (Object.keys(patch).length === 0) throw new ValidationError('Empty patch')
  if (patch.entries !== undefined) assertEntries(patch.entries)
  return repo.updateWealthCheckin(owner, id, patch)
}

export async function removeWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteWealthCheckin(owner, id)
}
