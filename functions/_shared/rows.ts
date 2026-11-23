import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  Flag,
  Label,
  StoredTransaction,
  TransactionAttachment,
  TxnType,
} from '../domain/types'

export { toSettings, type SettingsRow } from './settingsRow'

export interface CategoryRow {
  id: number
  name: string
  monthly_budget_cents: number
  sort_order: number
  icon: string | null
  color: string | null
  active: number
}

export interface AccountRow {
  id: number
  name: string
  kind: 'debit' | 'credit'
  settlement: 'immediate' | 'deferred'
  active: number
}

export interface FlagRow {
  id: number
  name: string
  color: string
  description: string | null
  reimbursable: number
  sort_order: number
  active: number
  auto_label_id: number | null
}

export interface LabelRow {
  id: number
  name: string
  color: string
  description: string | null
  sort_order: number
  active: number
}

export interface AttachmentRow {
  id: number
  transaction_id: number
  object_key: string
  thumb_key: string | null
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  original_name: string | null
  created_at: string
}

export interface TxnRow {
  id: number
  date: string
  budget_month: string
  description: string
  account_id: number
  category_id: number
  type: TxnType
  amount_cents: number
  cancelled: number
  notes: string | null
  created_at: string | null
  plan_id: number | null
  installment_index: number | null
  flag_id: number | null
  settled_by: number | null
  report_count: number | null
  report_covered_cents: number | null
}

export interface StatementRow {
  account_id: number
  year_month: string
  paid: number
  paid_on: string | null
}

export function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    monthlyBudgetCents: r.monthly_budget_cents,
    sortOrder: r.sort_order,
    active: r.active === 1,
    ...(r.icon ? { icon: r.icon } : {}),
    ...(r.color ? { color: r.color } : {}),
  }
}

export function toAccount(r: AccountRow): Account {
  return { id: r.id, name: r.name, kind: r.kind, settlement: r.settlement, active: r.active === 1 }
}

export function toFlag(r: FlagRow): Flag {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    active: r.active === 1,
    reimbursable: r.reimbursable === 1,
    ...(r.description ? { description: r.description } : {}),
    ...(r.auto_label_id != null ? { autoLabelId: r.auto_label_id } : {}),
  }
}

export function toLabel(r: LabelRow): Label {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    active: r.active === 1,
    ...(r.description ? { description: r.description } : {}),
  }
}

export function toAttachment(r: AttachmentRow): TransactionAttachment {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    contentType: r.content_type,
    byteSize: r.byte_size,
    createdAt: r.created_at,
    hasThumb: r.thumb_key != null,
    ...(r.width != null ? { width: r.width } : {}),
    ...(r.height != null ? { height: r.height } : {}),
    ...(r.original_name ? { originalName: r.original_name } : {}),
  }
}

export function toStoredTxn(r: TxnRow): StoredTransaction {
  return {
    id: r.id,
    date: r.date,
    budgetMonth: r.budget_month,
    description: r.description,
    accountId: r.account_id,
    categoryId: r.category_id,
    type: r.type,
    amountCents: r.amount_cents,
    cancelled: r.cancelled === 1,
    ...(r.notes ? { notes: r.notes } : {}),
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    ...(r.plan_id != null ? { planId: r.plan_id } : {}),
    ...(r.installment_index != null ? { installmentIndex: r.installment_index } : {}),
    ...(r.flag_id != null ? { flagId: r.flag_id } : {}),
    ...(r.settled_by != null ? { settledBy: r.settled_by } : {}),
    ...(r.report_count != null ? { reportCount: r.report_count } : {}),
    ...(r.report_covered_cents != null ? { reportCoveredCents: r.report_covered_cents } : {}),
  }
}

export function toStatement(r: StatementRow): AccountStatement {
  return {
    accountId: r.account_id,
    yearMonth: r.year_month,
    paid: r.paid === 1,
    ...(r.paid_on ? { paidOn: r.paid_on } : {}),
  }
}

export interface CashActualRow {
  year_month: string
  actual_cash_cents: number
}

export function toCashActual(r: CashActualRow): CashActual {
  return { yearMonth: r.year_month, actualCashCents: r.actual_cash_cents }
}
