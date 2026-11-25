import { withoutFlag } from '../domain/engine/flagGroups'
import type { Account, Category, ExpenseDataset, ExpenseSettings, Flag, Label } from '../types'
import type { DeleteAccountResult, DeleteCategoryResult } from '../data/dataSource'
import { cloneDataset, redriveTransactions, upsertById } from './datasetPatchHelpers'

export function patchAfterCategory(
  dataset: ExpenseDataset,
  category: Category,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.categories, category)
  d.categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterFlag(
  dataset: ExpenseDataset,
  flag: Flag,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.flags, flag)
  d.flags.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

/**
 * Deleting a flag clears it from its transactions rather than reassigning them
 * — the mirror of what `dbFlags.deleteFlag` does in one D1 batch. Note the
 * destructure: `exactOptionalPropertyTypes` forbids assigning `undefined` to an
 * optional field, so the key has to be omitted.
 */
export function patchAfterFlagDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.flags = d.flags.filter((f) => f.id !== id)
  d.transactions = d.transactions.map((t) => (t.flagId === id ? withoutFlag(t) : t))
  return d
}

export function patchAfterLabel(
  dataset: ExpenseDataset,
  label: Label,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.labels, label)
  d.labels.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

/**
 * Deleting a label unlinks it from its transactions rather than reassigning
 * them — the mirror of what dbLabels.deleteLabel does in D1. Unlike a flag's
 * single flagId, a label id has to be filtered out of each transaction's
 * array rather than cleared outright, since other labels on the same row survive.
 */
export function patchAfterLabelDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.labels = d.labels.filter((l) => l.id !== id)
  d.transactions = d.transactions.map((t) =>
    t.labelIds?.includes(id) ? { ...t, labelIds: t.labelIds.filter((lid) => lid !== id) } : t,
  )
  return d
}

export function patchAfterAccount(
  dataset: ExpenseDataset,
  account: Account,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.accounts, account)
  redriveTransactions(d)
  return d
}

export function patchAfterCategoryDelete(
  dataset: ExpenseDataset,
  id: number,
  result: DeleteCategoryResult,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.categories = d.categories.filter((c) => c.id !== id)
  if (result.createdCategory) d.categories.push(result.createdCategory)
  d.categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const targetId = result.reassignedToId
  if (targetId != null) {
    d.transactions = d.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: targetId } : t))
    d.installmentPlans = d.installmentPlans.map((p) => (p.categoryId === id ? { ...p, categoryId: targetId } : p))
  }
  return d
}

export function patchAfterAccountDelete(
  dataset: ExpenseDataset,
  id: number,
  result: DeleteAccountResult,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.accounts = d.accounts.filter((a) => a.id !== id)
  if (result.createdAccount) d.accounts.push(result.createdAccount)
  const targetId = result.reassignedToId
  // Mirror the D1/in-memory adapters: an unused account can still be the configured
  // default, and a reassigned-away default should follow its transactions/plans/statements.
  if (d.settings.defaultAccountId === id) {
    d.settings = { ...d.settings, defaultAccountId: targetId }
  }
  if (targetId != null) {
    d.transactions = d.transactions.map((t) => (t.accountId === id ? { ...t, accountId: targetId } : t))
    d.installmentPlans = d.installmentPlans.map((p) => (p.accountId === id ? { ...p, accountId: targetId } : p))
    // Mirror the D1/in-memory adapters: drop the source's statement for any month
    // the target already has one for, then move the rest.
    const targetMonths = new Set(d.accountStatements.filter((s) => s.accountId === targetId).map((s) => s.yearMonth))
    d.accountStatements = d.accountStatements
      .filter((s) => !(s.accountId === id && targetMonths.has(s.yearMonth)))
      .map((s) => (s.accountId === id ? { ...s, accountId: targetId } : s))
  }
  redriveTransactions(d)
  return d
}

function copySetting<K extends keyof ExpenseSettings>(
  to: ExpenseSettings,
  from: ExpenseSettings,
  key: K,
): void {
  to[key] = from[key]
}

/**
 * Puts a settings row the server sent back into the dataset. With `keys` only those settings are
 * taken from it: the row is the whole table as it stood when that write was handled, so one that
 * answers late carries older values for everything the write did not touch, and taking all of it
 * would put them back on screen.
 */
export function patchAfterSettings(
  dataset: ExpenseDataset,
  settings: ExpenseSettings,
  keys?: readonly (keyof ExpenseSettings)[],
): ExpenseDataset {
  const d = cloneDataset(dataset)
  if (keys === undefined) {
    d.settings = settings
    return d
  }
  const next = { ...d.settings }
  for (const key of keys) copySetting(next, settings, key)
  d.settings = next
  return d
}
