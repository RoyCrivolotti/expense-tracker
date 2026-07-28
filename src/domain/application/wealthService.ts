import type { ExpenseRepository } from '../ports/expenseRepository'
import type { NewWealthAccount, NewWealthCheckin } from '../data/dataSource'
import type { WealthAccount, WealthCheckin } from '../types'

export async function createWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  input: NewWealthAccount,
): Promise<WealthAccount> {
  const name = input.name?.trim()
  if (!name) throw new Error('Account name is required')
  return repo.createWealthAccount(owner, { ...input, name })
}

export async function patchWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewWealthAccount>,
): Promise<WealthAccount> {
  if (Object.keys(patch).length === 0) throw new Error('Empty patch')
  return repo.updateWealthAccount(owner, id, patch)
}

export async function removeWealthAccount(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteWealthAccount(owner, id)
}

export async function createWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  input: NewWealthCheckin,
): Promise<WealthCheckin> {
  if (!input.checkinDate?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    throw new Error('checkinDate must be YYYY-MM-DD')
  }
  return repo.createWealthCheckin(owner, input)
}

export async function patchWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewWealthCheckin>,
): Promise<WealthCheckin> {
  if (Object.keys(patch).length === 0) throw new Error('Empty patch')
  return repo.updateWealthCheckin(owner, id, patch)
}

export async function removeWealthCheckin(
  repo: ExpenseRepository,
  owner: string,
  id: number,
): Promise<void> {
  await repo.deleteWealthCheckin(owner, id)
}
