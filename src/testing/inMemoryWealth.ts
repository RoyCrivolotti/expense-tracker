import { addDaysIso } from '../domain/engine/dates'
import type { ExpenseWealth } from '../domain/ports/expensePlanning'
import type { WealthAccount, WealthCheckin } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { nextId, type InMemoryState, type Op, type OwnerStore, using } from './inMemoryStore'

/**
 * Mirrors the kind whitelist dbWealth.ts enforces on create and update.
 *
 * Returns the error rather than throwing: the D1 adapter is async, so it *rejects*.
 * A guard that threw synchronously here would not be caught by a caller's `.catch`,
 * which is the same class of divergence these mirrors exist to prevent.
 */
export function invalidWealthKind(kind: unknown): RepoHttpError | undefined {
  return ['investment', 'cash', 'other_asset', 'debt'].includes(kind as string)
    ? undefined
    : new RepoHttpError(400, 'Invalid account kind')
}

/** Mirrors assertCheckinDate in dbWealth.ts, including its one day of UTC slack. */
export function invalidCheckinDate(date: string | undefined): RepoHttpError | undefined {
  if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return new RepoHttpError(400, 'checkinDate must be YYYY-MM-DD')
  }
  if (date > addDaysIso(new Date().toISOString().slice(0, 10), 1)) {
    return new RepoHttpError(400, 'checkinDate cannot be in the future')
  }
  return undefined
}

/**
 * Mirrors assertOwnedAccountIds in dbWealth.ts — a real cross-tenant guard. Without
 * it a test asserting that a foreign account id is rejected passes against this
 * double while exercising nothing.
 */
export function unownedWealthAccount(
  store: OwnerStore,
  entries: { accountId: number }[],
): RepoHttpError | undefined {
  for (const { accountId } of entries) {
    if (!store.wealthAccounts.some((a) => a.id === accountId)) {
      return new RepoHttpError(400, `Wealth account ${accountId} not found or not owned`)
    }
  }
  return undefined
}

export const createWealthAccount: Op<'createWealthAccount'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const name = input.name?.trim()
  if (!name) return Promise.reject(new RepoHttpError(400, 'Account name is required'))
  const badKind = invalidWealthKind(input.kind)
  if (badKind) return Promise.reject(badKind)
  const account: WealthAccount = {
    id: nextId(store.wealthAccounts),
    name,
    kind: input.kind,
    sortOrder: input.sortOrder,
    archived: input.archived,
  }
  store.wealthAccounts.push(account)
  return Promise.resolve({ ...account })
}

export const updateWealthAccount: Op<'updateWealthAccount'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.wealthAccounts.findIndex((a) => a.id === id)
  if (index < 0) return Promise.reject(new RepoHttpError(404, 'Wealth account not found'))
  if (Object.keys(patch).length === 0) return Promise.reject(new RepoHttpError(400, 'Empty patch'))
  const badKind = patch.kind !== undefined ? invalidWealthKind(patch.kind) : undefined
  if (badKind) return Promise.reject(badKind)
  const updated = { ...store.wealthAccounts[index]!, ...patch, id }
  store.wealthAccounts[index] = updated
  return Promise.resolve({ ...updated })
}

export const deleteWealthAccount: Op<'deleteWealthAccount'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const hasEntries = store.wealthCheckins.some((c) => c.entries.some((e) => e.accountId === id))
  if (hasEntries) {
    const index = store.wealthAccounts.findIndex((a) => a.id === id)
    if (index < 0) return Promise.reject(new RepoHttpError(404, 'Wealth account not found'))
    store.wealthAccounts[index] = { ...store.wealthAccounts[index]!, archived: true }
    return Promise.resolve({ archived: true })
  }
  const index = store.wealthAccounts.findIndex((a) => a.id === id)
  if (index < 0) return Promise.reject(new RepoHttpError(404, 'Wealth account not found'))
  store.wealthAccounts.splice(index, 1)
  return Promise.resolve({ archived: false })
}

export const createWealthCheckin: Op<'createWealthCheckin'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  const badDate = invalidCheckinDate(input.checkinDate)
  if (badDate) return Promise.reject(badDate)
  const unowned = unownedWealthAccount(store, input.entries)
  if (unowned) return Promise.reject(unowned)
  const checkin: WealthCheckin = {
    id: nextId(store.wealthCheckins),
    checkinDate: input.checkinDate,
    ...(input.note ? { note: input.note } : {}),
    createdAt: new Date().toISOString(),
    entries: input.entries.map((e) => ({ ...e })),
  }
  store.wealthCheckins.push(checkin)
  return Promise.resolve({ ...checkin, entries: [...checkin.entries] })
}

export const updateWealthCheckin: Op<'updateWealthCheckin'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.wealthCheckins.findIndex((c) => c.id === id)
  if (index < 0) return Promise.reject(new RepoHttpError(404, 'Wealth check-in not found'))
  if (Object.keys(patch).length === 0) return Promise.reject(new RepoHttpError(400, 'Empty patch'))
  const badDate = patch.checkinDate !== undefined ? invalidCheckinDate(patch.checkinDate) : undefined
  if (badDate) return Promise.reject(badDate)
  const unowned = patch.entries !== undefined ? unownedWealthAccount(store, patch.entries) : undefined
  if (unowned) return Promise.reject(unowned)
  const existing = store.wealthCheckins[index]!
  const updated: WealthCheckin = {
    ...existing,
    ...(patch.checkinDate !== undefined ? { checkinDate: patch.checkinDate } : {}),
    ...(patch.note !== undefined ? (patch.note ? { note: patch.note } : {}) : {}),
    ...(patch.entries !== undefined ? { entries: patch.entries.map((e) => ({ ...e })) } : {}),
    id,
  }
  store.wealthCheckins[index] = updated
  return Promise.resolve({ ...updated, entries: [...updated.entries] })
}

export const deleteWealthCheckin: Op<'deleteWealthCheckin'> = (
  state,
  owner,
  id,
) => {
  const store = state.storeFor(owner)
  const index = store.wealthCheckins.findIndex((c) => c.id === id)
  if (index < 0) return Promise.reject(new RepoHttpError(404, 'Wealth check-in not found'))
  store.wealthCheckins.splice(index, 1)
  return Promise.resolve()
}

export function wealth(state: InMemoryState): ExpenseWealth {
  return {
    createWealthAccount: using(state, createWealthAccount),
    updateWealthAccount: using(state, updateWealthAccount),
    deleteWealthAccount: using(state, deleteWealthAccount),
    createWealthCheckin: using(state, createWealthCheckin),
    updateWealthCheckin: using(state, updateWealthCheckin),
    deleteWealthCheckin: using(state, deleteWealthCheckin),
  }
}
