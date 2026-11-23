/**
 * The seed's reference tables, one builder each: categories, accounts, labels, flags, card statements, cash
 * actuals and instalment plans, with every id moved into its table's block.
 */
import type { ExpenseDataset } from '../../src/domain/types'
import { bit, jsonInsert, type IdBases, type Row, type SeedStep } from './seedStatement'

const step = (
  table: string,
  columns: string[],
  rows: Row[],
  keys?: string[],
): SeedStep[] =>
  rows.length === 0 ? [] : [{ statement: jsonInsert(table, columns, rows, keys), table, rows: rows.length }]

function categories(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'categories',
    ['id', 'name', 'monthly_budget_cents', 'sort_order', 'icon', 'color', 'active'],
    d.categories.map((c) => ({
      id: b.categories + c.id,
      name: c.name,
      monthly_budget_cents: c.monthlyBudgetCents,
      sort_order: c.sortOrder,
      icon: c.icon ?? null,
      color: c.color ?? null,
      active: bit(c.active),
    })),
  )
}

function accounts(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'accounts',
    ['id', 'name', 'kind', 'settlement', 'active'],
    d.accounts.map((a) => ({
      id: b.accounts + a.id,
      name: a.name,
      kind: a.kind,
      settlement: a.settlement,
      active: bit(a.active),
    })),
  )
}

function labels(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'labels',
    ['id', 'name', 'color', 'description', 'sort_order', 'active'],
    d.labels.map((l) => ({
      id: b.labels + l.id,
      name: l.name,
      color: l.color,
      description: l.description ?? null,
      sort_order: l.sortOrder,
      active: bit(l.active),
    })),
  )
}

function flags(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'flags',
    ['id', 'name', 'color', 'description', 'sort_order', 'active', 'reimbursable', 'auto_label_id'],
    d.flags.map((f) => ({
      id: b.flags + f.id,
      name: f.name,
      color: f.color,
      description: f.description ?? null,
      sort_order: f.sortOrder,
      active: bit(f.active),
      reimbursable: bit(f.reimbursable),
      auto_label_id: f.autoLabelId == null ? null : b.labels + f.autoLabelId,
    })),
  )
}

function accountStatements(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'account_statements',
    ['account_id', 'year_month', 'paid', 'paid_on'],
    d.accountStatements.map((s) => ({
      account_id: b.accounts + s.accountId,
      year_month: s.yearMonth,
      paid: bit(s.paid),
      paid_on: s.paidOn ?? null,
    })),
  )
}

function cashActuals(d: ExpenseDataset): SeedStep[] {
  return step(
    'cash_actuals',
    ['year_month', 'actual_cash_cents'],
    d.cashActuals.map((c) => ({ year_month: c.yearMonth, actual_cash_cents: c.actualCashCents })),
  )
}

function installmentPlans(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return step(
    'installment_plans',
    [
      'id',
      'description',
      'total_count',
      'amount_cents',
      'account_id',
      'category_id',
      'type',
      'anchor_budget_month',
      'start_installment_index',
      'active',
      'due_day_of_month',
    ],
    d.installmentPlans.map((p) => ({
      id: b.installment_plans + p.id,
      description: p.description,
      total_count: p.totalCount,
      amount_cents: p.amountCents,
      account_id: b.accounts + p.accountId,
      category_id: b.categories + p.categoryId,
      type: p.type,
      anchor_budget_month: p.anchorBudgetMonth,
      start_installment_index: p.startInstallmentIndex,
      active: bit(p.active),
      due_day_of_month: p.dueDayOfMonth ?? null,
    })),
  )
}

/** Every reference table, in an order the foreign keys allow. */
export function reference(
  d: ExpenseDataset,
  b: IdBases,
): SeedStep[] {
  return [
    ...categories(d, b),
    ...accounts(d, b),
    ...labels(d, b),
    ...flags(d, b),
    ...accountStatements(d, b),
    ...cashActuals(d),
    ...installmentPlans(d, b),
  ]
}
