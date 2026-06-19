import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseSettings,
  GoalInputs,
  StoredTransaction,
  TxnType,
} from '@domain/types'

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

export interface SettingsRow {
  opening_cash_cents: number
  opening_investment_cents: number
  liquid_net_worth_cents: number
  default_account_id: number | null
}

export interface GoalRow {
  house_price_cents: number
  down_payment_fraction: number
  mortgage_term_years: number
  mortgage_rate_annual: number
  long_term_target_cents: number
  horizon_years: number
  expected_real_return: number
}

export function toSettings(r: SettingsRow): ExpenseSettings {
  return {
    openingCashCents: r.opening_cash_cents,
    openingInvestmentCents: r.opening_investment_cents,
    liquidNetWorthCents: r.liquid_net_worth_cents,
    defaultAccountId: r.default_account_id ?? null,
  }
}

export function toGoalInputs(r: GoalRow): GoalInputs {
  return {
    housePriceCents: r.house_price_cents,
    downPaymentFraction: r.down_payment_fraction,
    mortgageTermYears: r.mortgage_term_years,
    mortgageRateAnnual: r.mortgage_rate_annual,
    longTermTargetCents: r.long_term_target_cents,
    horizonYears: r.horizon_years,
    expectedRealReturn: r.expected_real_return,
  }
}
