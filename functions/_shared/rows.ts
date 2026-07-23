import type {
  Account,
  AccountStatement,
  CashActual,
  Category,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
  InstallmentPlan,
  StoredTransaction,
  TxnType,
} from '../domain/types'
import { DEFAULT_BUDGET_ROLLOVER_DAY } from '../domain/engine/dates'
import { DEFAULT_CURRENCY_CODE, DEFAULT_NUMBER_LOCALE } from '../domain/engine/money'

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
  created_at: string | null
  plan_id: number | null
  installment_index: number | null
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
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    ...(r.plan_id != null ? { planId: r.plan_id } : {}),
    ...(r.installment_index != null ? { installmentIndex: r.installment_index } : {}),
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
  currency_code: string | null
  number_locale: string | null
  budget_rollover_day: number | null
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
    currencyCode: r.currency_code ?? DEFAULT_CURRENCY_CODE,
    numberLocale: r.number_locale ?? DEFAULT_NUMBER_LOCALE,
    budgetRolloverDay: r.budget_rollover_day ?? DEFAULT_BUDGET_ROLLOVER_DAY,
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

export interface GoalScenarioRow {
  id: number
  name: string
  color: string
  sort_order: number
  start_invested_cents: number
  monthly_contribution_cents: number
  annual_contribution_growth: number
  expected_real_return: number
  horizon_years: number
  house_price_cents: number
  down_payment_fraction: number
  house_purchase_year: number | null
  transaction_costs_cents: number
  mortgage_term_years: number
  mortgage_rate_annual: number
  house_appreciation_rate: number
  rent_monthly_cents: number
  annual_spend_cents: number
  safe_withdrawal_rate: number
}

export function toGoalScenario(r: GoalScenarioRow): GoalScenario {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    startInvestedCents: r.start_invested_cents,
    monthlyContributionCents: r.monthly_contribution_cents,
    annualContributionGrowth: r.annual_contribution_growth,
    expectedRealReturn: r.expected_real_return,
    horizonYears: r.horizon_years,
    housePriceCents: r.house_price_cents,
    downPaymentFraction: r.down_payment_fraction,
    housePurchaseYear: r.house_purchase_year,
    transactionCostsCents: r.transaction_costs_cents,
    mortgageTermYears: r.mortgage_term_years,
    mortgageRateAnnual: r.mortgage_rate_annual,
    houseAppreciationRate: r.house_appreciation_rate,
    rentMonthlyCents: r.rent_monthly_cents,
    annualSpendCents: r.annual_spend_cents,
    safeWithdrawalRate: r.safe_withdrawal_rate,
  }
}

export interface InstallmentPlanRow {
  id: number
  description: string
  total_count: number
  amount_cents: number
  account_id: number
  category_id: number
  type: TxnType
  anchor_budget_month: string
  start_installment_index: number
  due_day_of_month: number | null
  active: number
}

export function toInstallmentPlan(r: InstallmentPlanRow): InstallmentPlan {
  return {
    id: r.id,
    description: r.description,
    totalCount: r.total_count,
    amountCents: r.amount_cents,
    accountId: r.account_id,
    categoryId: r.category_id,
    type: r.type,
    anchorBudgetMonth: r.anchor_budget_month,
    startInstallmentIndex: r.start_installment_index,
    ...(r.due_day_of_month != null ? { dueDayOfMonth: r.due_day_of_month } : {}),
    active: r.active === 1,
  }
}
