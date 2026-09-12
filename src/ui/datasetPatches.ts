import { deriveTransactions } from '../engine/status'
import { withoutFlag } from '../domain/engine/flagGroups'
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  Flag,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  Transaction,
  TransactionAttachment,
  WealthAccount,
  WealthCheckin,
} from '../types'
import type { DeleteAccountResult, DeleteCategoryResult } from '../data/dataSource'

function cloneDataset(dataset: ExpenseDataset): ExpenseDataset {
  return structuredClone(dataset)
}

function redriveTransactions(d: ExpenseDataset): void {
  d.transactions = deriveTransactions(d.transactions, d.accounts, d.accountStatements)
}

function upsertById<T extends { id: number }>(list: T[], row: T): void {
  const i = list.findIndex((r) => r.id === row.id)
  if (i >= 0) list[i] = row
  else list.push(row)
}

function upsertStatement(list: AccountStatement[], row: AccountStatement): void {
  const i = list.findIndex(
    (s) => s.accountId === row.accountId && s.yearMonth === row.yearMonth,
  )
  if (i >= 0) list[i] = row
  else list.push(row)
}

export function patchAfterTransactionCreate(
  dataset: ExpenseDataset,
  txn: Transaction,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = [...d.transactions, txn].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
  )
  return d
}

export function patchAfterTransactionUpdate(
  dataset: ExpenseDataset,
  txn: Transaction,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.map((t) => (t.id === txn.id ? txn : t))
  return d
}

export function patchAfterTransactionDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.filter((t) => t.id !== id)
  return d
}

export function patchAfterBulkCreate(
  dataset: ExpenseDataset,
  txns: Transaction[],
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.transactions = [...d.transactions, ...txns].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
  )
  return d
}

export function patchAfterBulkDelete(
  dataset: ExpenseDataset,
  ids: number[],
): ExpenseDataset {
  const drop = new Set(ids)
  const d = cloneDataset(dataset)
  d.transactions = d.transactions.filter((t) => !drop.has(t.id))
  return d
}

export function patchAfterBulkUpdate(
  dataset: ExpenseDataset,
  updated: Transaction[],
): ExpenseDataset {
  const d = cloneDataset(dataset)
  const map = new Map(updated.map((t) => [t.id, t]))
  d.transactions = d.transactions.map((t) => map.get(t.id) ?? t)
  d.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  return d
}

export function patchAfterStatementPaid(
  dataset: ExpenseDataset,
  stmt: AccountStatement,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertStatement(d.accountStatements, stmt)
  redriveTransactions(d)
  return d
}

export function patchAfterCashActual(
  dataset: ExpenseDataset,
  row: CashActual | null,
  yearMonth: string,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.cashActuals = d.cashActuals.filter((c) => c.yearMonth !== yearMonth)
  if (row) d.cashActuals.push(row)
  return d
}

export function patchAfterCategory(
  dataset: ExpenseDataset,
  category: Category,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.categories, category)
  d.categories.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterAttachmentAdd(
  dataset: ExpenseDataset,
  attachment: TransactionAttachment,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.attachments, attachment)
  return d
}

export function patchAfterAttachmentDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.attachments = d.attachments.filter((a) => a.id !== id)
  return d
}

export function patchAfterFlag(dataset: ExpenseDataset, flag: Flag): ExpenseDataset {
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
export function patchAfterFlagDelete(dataset: ExpenseDataset, id: number): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.flags = d.flags.filter((f) => f.id !== id)
  d.transactions = d.transactions.map((t) => (t.flagId === id ? withoutFlag(t) : t))
  return d
}

export function patchAfterAccount(dataset: ExpenseDataset, account: Account): ExpenseDataset {
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
    d.transactions = d.transactions.map((t) =>
      t.categoryId === id ? { ...t, categoryId: targetId } : t,
    )
    d.installmentPlans = d.installmentPlans.map((p) =>
      p.categoryId === id ? { ...p, categoryId: targetId } : p,
    )
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
    d.transactions = d.transactions.map((t) =>
      t.accountId === id ? { ...t, accountId: targetId } : t,
    )
    d.installmentPlans = d.installmentPlans.map((p) =>
      p.accountId === id ? { ...p, accountId: targetId } : p,
    )
    // Mirror the D1/in-memory adapters: drop the source's statement for any month
    // the target already has one for, then move the rest.
    const targetMonths = new Set(
      d.accountStatements.filter((s) => s.accountId === targetId).map((s) => s.yearMonth),
    )
    d.accountStatements = d.accountStatements
      .filter((s) => !(s.accountId === id && targetMonths.has(s.yearMonth)))
      .map((s) => (s.accountId === id ? { ...s, accountId: targetId } : s))
  }
  redriveTransactions(d)
  return d
}

export function patchAfterSettings(
  dataset: ExpenseDataset,
  settings: ExpenseSettings,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.settings = settings
  return d
}

export function patchAfterGoals(dataset: ExpenseDataset, goals: GoalInputs): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.goalInputs = goals
  return d
}

export function patchAfterScenarioCreate(
  dataset: ExpenseDataset,
  scenario: GoalScenario,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.goalScenarios = [...d.goalScenarios, scenario].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
  return d
}

export function patchAfterScenarioUpdate(
  dataset: ExpenseDataset,
  scenario: GoalScenario,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.goalScenarios, scenario)
  d.goalScenarios.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterScenarioDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.goalScenarios = d.goalScenarios.filter((s) => s.id !== id)
  return d
}

export function patchAfterInstallmentPlanCreate(
  dataset: ExpenseDataset,
  plan: InstallmentPlan,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.installmentPlans = [...d.installmentPlans, plan]
  return d
}

export function patchAfterInstallmentPlanUpdate(
  dataset: ExpenseDataset,
  plan: InstallmentPlan,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.installmentPlans, plan)
  return d
}

export function patchAfterInstallmentPlanDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.installmentPlans = d.installmentPlans.filter((p) => p.id !== id)
  return d
}

export function patchAfterWealthAccountCreate(
  dataset: ExpenseDataset,
  account: WealthAccount,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthAccounts = [...d.wealthAccounts, account].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  )
  return d
}

export function patchAfterWealthAccountUpdate(
  dataset: ExpenseDataset,
  account: WealthAccount,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.wealthAccounts, account)
  d.wealthAccounts.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  return d
}

export function patchAfterWealthAccountDelete(
  dataset: ExpenseDataset,
  id: number,
  archived: boolean,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  if (archived) {
    // Server soft-deleted (archived) because the account has check-in history.
    d.wealthAccounts = d.wealthAccounts.map((a) => (a.id === id ? { ...a, archived: true } : a))
  } else {
    d.wealthAccounts = d.wealthAccounts.filter((a) => a.id !== id)
  }
  return d
}

export function patchAfterWealthCheckinCreate(
  dataset: ExpenseDataset,
  checkin: WealthCheckin,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthCheckins = [checkin, ...d.wealthCheckins].sort(
    (a, b) => b.checkinDate.localeCompare(a.checkinDate) || b.id - a.id,
  )
  return d
}

export function patchAfterWealthCheckinUpdate(
  dataset: ExpenseDataset,
  checkin: WealthCheckin,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.wealthCheckins, checkin)
  d.wealthCheckins.sort((a, b) => b.checkinDate.localeCompare(a.checkinDate) || b.id - a.id)
  return d
}

export function patchAfterWealthCheckinDelete(
  dataset: ExpenseDataset,
  id: number,
): ExpenseDataset {
  const d = cloneDataset(dataset)
  d.wealthCheckins = d.wealthCheckins.filter((c) => c.id !== id)
  return d
}
