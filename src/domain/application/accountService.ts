import type { DeleteAccountOptions } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'

export function validateAccountName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('Account name is required')
  return trimmed
}

export async function removeAccount(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  options?: DeleteAccountOptions,
) {
  if (!options?.createAccount) return repo.deleteAccount(owner, id, options)
  return repo.deleteAccount(owner, id, {
    ...options,
    createAccount: {
      ...options.createAccount,
      name: validateAccountName(options.createAccount.name),
    },
  })
}
