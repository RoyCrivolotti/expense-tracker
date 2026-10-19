/**
 * Writes an `ExpenseDataset` into a migrated node:sqlite database as one owner's rows, so the real
 * `loadDataset` (and later the real query layer) can be exercised against a synthetic ledger. Covers the
 * tables the dataset's transaction side needs; settings, scenarios and wealth stay at their defaults.
 */
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import type { ExpenseDataset } from '../domain/types'

type Row = SQLInputValue[]

function insertAll<T>(stmt: StatementSync, items: T[], toRow: (item: T) => Row): void {
  for (const item of items) stmt.run(...toRow(item))
}

const bit = (value: boolean): number => (value ? 1 : 0)

function seedReference(db: DatabaseSync, owner: string, d: ExpenseDataset): void {
  insertAll(
    db.prepare('INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,icon,color,active) VALUES (?,?,?,?,?,?,?,?)'),
    d.categories,
    (c) => [owner, c.id, c.name, c.monthlyBudgetCents, c.sortOrder, c.icon ?? null, c.color ?? null, bit(c.active)],
  )
  insertAll(
    db.prepare('INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,?,?,?,?,?)'),
    d.accounts,
    (a) => [owner, a.id, a.name, a.kind, a.settlement, bit(a.active)],
  )
  insertAll(
    db.prepare('INSERT INTO labels (owner,id,name,color,description,sort_order,active) VALUES (?,?,?,?,?,?,?)'),
    d.labels,
    (l) => [owner, l.id, l.name, l.color, l.description ?? null, l.sortOrder, bit(l.active)],
  )
  insertAll(
    db.prepare('INSERT INTO flags (owner,id,name,color,description,sort_order,active,reimbursable,auto_label_id) VALUES (?,?,?,?,?,?,?,?,?)'),
    d.flags,
    (f) => [owner, f.id, f.name, f.color, f.description ?? null, f.sortOrder, bit(f.active), bit(f.reimbursable), f.autoLabelId ?? null],
  )
  insertAll(
    db.prepare('INSERT INTO account_statements (owner,account_id,year_month,paid,paid_on) VALUES (?,?,?,?,?)'),
    d.accountStatements,
    (s) => [owner, s.accountId, s.yearMonth, bit(s.paid), s.paidOn ?? null],
  )
  insertAll(
    db.prepare('INSERT INTO cash_actuals (owner,year_month,actual_cash_cents) VALUES (?,?,?)'),
    d.cashActuals,
    (c) => [owner, c.yearMonth, c.actualCashCents],
  )
  insertAll(
    db.prepare('INSERT INTO installment_plans (id,owner,description,total_count,amount_cents,account_id,category_id,type,anchor_budget_month,start_installment_index,active,due_day_of_month) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
    d.installmentPlans,
    (p) => [p.id, owner, p.description, p.totalCount, p.amountCents, p.accountId, p.categoryId, p.type, p.anchorBudgetMonth, p.startInstallmentIndex, bit(p.active), p.dueDayOfMonth ?? null],
  )
}

function seedTransactions(db: DatabaseSync, owner: string, d: ExpenseDataset): void {
  insertAll(
    db.prepare('INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled,notes,created_at,plan_id,installment_index,flag_id,settled_by,report_count,report_covered_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    d.transactions,
    (t) => [owner, t.id, t.date, t.budgetMonth, t.description, t.accountId, t.categoryId, t.type, t.amountCents, bit(t.cancelled), t.notes ?? null, t.createdAt ?? `${t.date}T00:00:00Z`, t.planId ?? null, t.installmentIndex ?? null, t.flagId ?? null, t.settledBy ?? null, t.reportCount ?? null, t.reportCoveredCents ?? null],
  )
  const links = d.transactions.flatMap((t) => (t.labelIds ?? []).map((labelId): Row => [t.id, labelId]))
  insertAll(db.prepare('INSERT INTO transaction_labels (transaction_id,label_id) VALUES (?,?)'), links, (l) => l)
  insertAll(
    db.prepare('INSERT INTO transaction_attachments (owner,id,transaction_id,object_key,thumb_key,content_type,byte_size,width,height,original_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'),
    d.attachments,
    (a) => [owner, a.id, a.transactionId, `receipts/${a.id}`, a.hasThumb ? `thumbs/${a.id}` : null, a.contentType, a.byteSize, a.width ?? null, a.height ?? null, a.originalName ?? null, a.createdAt],
  )
}

export function seedDataset(db: DatabaseSync, owner: string, dataset: ExpenseDataset): void {
  db.exec('BEGIN')
  try {
    seedReference(db, owner, dataset)
    seedTransactions(db, owner, dataset)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
