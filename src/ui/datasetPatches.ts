import { deriveTransactions } from '../engine/status'
import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseDataset,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  Transaction,
} from '../types'

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

export function patchAfterAccount(dataset: ExpenseDataset, account: Account): ExpenseDataset {
  const d = cloneDataset(dataset)
  upsertById(d.accounts, account)
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
