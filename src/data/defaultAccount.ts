import type { Account, ExpenseSettings } from '../types'

/** Pick the configured default account, or the first active account. */
export function resolveDefaultAccountId(accounts: Account[], settings: ExpenseSettings): number {
  const preferred = settings.defaultAccountId
  if (preferred != null && accounts.some((a) => a.id === preferred && a.active)) {
    return preferred
  }
  const firstActive = accounts.find((a) => a.active)
  return firstActive?.id ?? accounts[0]?.id ?? 0
}
