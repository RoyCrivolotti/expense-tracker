import type { DeleteAccountOptions, DeleteAccountResult, NewAccount } from '../domain/data/dataSource'
import type { Account } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { assertOwnedAccount } from './inMemoryGuards'
import { nextId, type Op, type OwnerStore } from './inMemoryStore'

export function createAccountInStore(
  store: OwnerStore,
  input: NewAccount,
): Account {
  const account: Account = {
    id: nextId(store.accounts),
    name: input.name,
    kind: input.kind,
    settlement: input.settlement,
    active: input.active,
  }
  store.accounts.push(account)
  return account
}

export function countAccountUsage(
  store: OwnerStore,
  id: number,
): number {
  const txns = store.transactions.filter((t) => t.accountId === id).length
  const plans = store.installmentPlans.filter((p) => p.accountId === id).length
  const statements = store.statements.filter((s) => s.accountId === id).length
  return txns + plans + statements
}

/** Mirrors the D1 adapter: move (or clear) settings.defaultAccountId if it pointed at the deleted account. */
export function syncDefaultAccountId(
  store: OwnerStore,
  deletedId: number,
  newTargetId: number | null,
): void {
  if (store.settings.defaultAccountId !== deletedId) return
  store.settings = { ...store.settings, defaultAccountId: newTargetId }
}

export function deleteAccountInStore(
  store: OwnerStore,
  id: number,
  options?: DeleteAccountOptions,
): DeleteAccountResult {
  const { reassignToId, createAccount: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new RepoHttpError(400, 'Specify either reassignToId or createAccount, not both')
  }

  if (reassignToId == null && !createInput) {
    const usage = countAccountUsage(store, id)
    if (usage > 0) throw new RepoHttpError(409, `Account is in use by ${usage} record(s)`)
    const index = store.accounts.findIndex((a) => a.id === id)
    if (index < 0) throw new RepoHttpError(404, 'Account not found')
    store.accounts.splice(index, 1)
    syncDefaultAccountId(store, id, null)
    return { reassignedToId: null }
  }

  let targetId: number
  let createdAccount: Account | undefined
  if (createInput) {
    createdAccount = createAccountInStore(store, createInput)
    targetId = createdAccount.id
  } else {
    if (reassignToId === id) throw new RepoHttpError(400, 'Cannot reassign an account to itself')
    targetId = assertOwnedAccount(store, reassignToId!).id
  }

  const index = store.accounts.findIndex((a) => a.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Account not found')
  store.accounts.splice(index, 1)
  store.transactions = store.transactions.map((t) => (t.accountId === id ? { ...t, accountId: targetId } : t))
  store.installmentPlans = store.installmentPlans.map((p) => (p.accountId === id ? { ...p, accountId: targetId } : p))
  // Mirror the D1 adapter: drop the source's statement for any month the target
  // already has one for (composite key can't hold both), then move the rest.
  const targetMonths = new Set(store.statements.filter((s) => s.accountId === targetId).map((s) => s.yearMonth))
  store.statements = store.statements
    .filter((s) => !(s.accountId === id && targetMonths.has(s.yearMonth)))
    .map((s) => (s.accountId === id ? { ...s, accountId: targetId } : s))
  syncDefaultAccountId(store, id, targetId)
  return { reassignedToId: targetId, ...(createdAccount ? { createdAccount } : {}) }
}

export const createAccount: Op<'createAccount'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve({ ...createAccountInStore(store, input) })
}

export const updateAccount: Op<'updateAccount'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.accounts.findIndex((a) => a.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Account not found')
  const keys = Object.keys(patch) as (keyof NewAccount)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  const updated = { ...store.accounts[index]!, ...patch, id }
  store.accounts[index] = updated
  return Promise.resolve({ ...updated })
}

export const deleteAccount: Op<'deleteAccount'> = (
  state,
  owner,
  id,
  options,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve(deleteAccountInStore(store, id, options))
}
