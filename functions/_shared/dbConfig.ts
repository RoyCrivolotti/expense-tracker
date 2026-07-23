import type {
  Account,
  Category,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
} from '../domain/types'
import type { NewAccount, NewCategory, NewGoalScenario } from '../domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedAccount } from './ownership'
import {
  toAccount,
  toCategory,
  toGoalInputs,
  toGoalScenario,
  toSettings,
  type AccountRow,
  type CategoryRow,
  type GoalRow,
  type GoalScenarioRow,
  type SettingsRow,
} from './rows'

type ColumnMap<T> = Record<keyof T, string>
type Coerce<T> = (key: keyof T, value: unknown) => unknown

/** Build the SET clause + bound values for a partial update; rejects empty patches. */
function buildUpdate<T>(columns: ColumnMap<T>, patch: Partial<T>, coerce: Coerce<T>) {
  const keys = (Object.keys(patch) as (keyof T)[]).filter((k) => k in columns)
  if (keys.length === 0) throw new HttpError(400, 'Empty patch')
  return {
    sets: keys.map((k) => `${columns[k]} = ?`).join(', '),
    values: keys.map((k) => coerce(k, patch[k])),
  }
}

const CATEGORY_COLUMNS: ColumnMap<NewCategory> = {
  name: 'name',
  monthlyBudgetCents: 'monthly_budget_cents',
  sortOrder: 'sort_order',
  icon: 'icon',
  color: 'color',
  active: 'active',
}
const coerceCategory: Coerce<NewCategory> = (key, value) =>
  key === 'active' ? (value ? 1 : 0) : (value ?? null)

export async function createCategory(
  env: Env,
  owner: string,
  input: NewCategory,
): Promise<Category> {
  const row = await env.DB.prepare(
    `INSERT INTO categories (owner, name, monthly_budget_cents, sort_order, icon, color, active)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      owner,
      input.name,
      input.monthlyBudgetCents,
      input.sortOrder,
      input.icon ?? null,
      input.color ?? null,
      input.active ? 1 : 0,
    )
    .first<CategoryRow>()
  if (!row) throw new HttpError(500, 'Category insert failed')
  return toCategory(row)
}

export async function updateCategory(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewCategory>,
): Promise<Category> {
  const { sets, values } = buildUpdate(CATEGORY_COLUMNS, patch, coerceCategory)
  const row = await env.DB.prepare(
    `UPDATE categories SET ${sets} WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<CategoryRow>()
  if (!row) throw new HttpError(404, 'Category not found')
  return toCategory(row)
}

const ACCOUNT_COLUMNS: ColumnMap<NewAccount> = {
  name: 'name',
  kind: 'kind',
  settlement: 'settlement',
  active: 'active',
}
const coerceAccount: Coerce<NewAccount> = (key, value) =>
  key === 'active' ? (value ? 1 : 0) : (value ?? null)

export async function createAccount(env: Env, owner: string, input: NewAccount): Promise<Account> {
  const row = await env.DB.prepare(
    `INSERT INTO accounts (owner, name, kind, settlement, active) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(owner, input.name, input.kind, input.settlement, input.active ? 1 : 0)
    .first<AccountRow>()
  if (!row) throw new HttpError(500, 'Account insert failed')
  return toAccount(row)
}

export async function updateAccount(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewAccount>,
): Promise<Account> {
  const { sets, values } = buildUpdate(ACCOUNT_COLUMNS, patch, coerceAccount)
  const row = await env.DB.prepare(
    `UPDATE accounts SET ${sets} WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<AccountRow>()
  if (!row) throw new HttpError(404, 'Account not found')
  return toAccount(row)
}

const SETTINGS_COLUMNS: ColumnMap<ExpenseSettings> = {
  openingCashCents: 'opening_cash_cents',
  openingInvestmentCents: 'opening_investment_cents',
  liquidNetWorthCents: 'liquid_net_worth_cents',
  defaultAccountId: 'default_account_id',
  currencyCode: 'currency_code',
  numberLocale: 'number_locale',
  budgetRolloverDay: 'budget_rollover_day',
}
const NULLABLE_SETTINGS = new Set<keyof ExpenseSettings>([
  'defaultAccountId',
  'currencyCode',
  'numberLocale',
  'budgetRolloverDay',
])
const coerceSettings: Coerce<ExpenseSettings> = (key, value) =>
  NULLABLE_SETTINGS.has(key) ? (value ?? null) : (value ?? 0)

export async function updateSettings(
  env: Env,
  owner: string,
  patch: Partial<ExpenseSettings>,
): Promise<ExpenseSettings> {
  if (patch.defaultAccountId != null) {
    await assertOwnedAccount(env, owner, patch.defaultAccountId)
  }
  if (
    patch.budgetRolloverDay != null &&
    (!Number.isInteger(patch.budgetRolloverDay) ||
      patch.budgetRolloverDay < 1 ||
      patch.budgetRolloverDay > 28)
  ) {
    throw new HttpError(400, 'budgetRolloverDay must be between 1 and 28')
  }
  const { sets, values } = buildUpdate(SETTINGS_COLUMNS, patch, coerceSettings)
  await env.DB.prepare('INSERT OR IGNORE INTO settings (owner) VALUES (?)').bind(owner).run()
  const row = await env.DB.prepare(`UPDATE settings SET ${sets} WHERE owner = ? RETURNING *`)
    .bind(...values, owner)
    .first<SettingsRow>()
  if (!row) throw new HttpError(500, 'Settings update failed')
  return toSettings(row)
}

const GOAL_COLUMNS: ColumnMap<GoalInputs> = {
  housePriceCents: 'house_price_cents',
  downPaymentFraction: 'down_payment_fraction',
  mortgageTermYears: 'mortgage_term_years',
  mortgageRateAnnual: 'mortgage_rate_annual',
  longTermTargetCents: 'long_term_target_cents',
  horizonYears: 'horizon_years',
  expectedRealReturn: 'expected_real_return',
}

export async function updateGoals(
  env: Env,
  owner: string,
  patch: Partial<GoalInputs>,
): Promise<GoalInputs> {
  const { sets, values } = buildUpdate(GOAL_COLUMNS, patch, (_k, v) => v ?? 0)
  await env.DB.prepare('INSERT OR IGNORE INTO goal_inputs (owner) VALUES (?)').bind(owner).run()
  const row = await env.DB.prepare(`UPDATE goal_inputs SET ${sets} WHERE owner = ? RETURNING *`)
    .bind(...values, owner)
    .first<GoalRow>()
  if (!row) throw new HttpError(500, 'Goals update failed')
  return toGoalInputs(row)
}

const SCENARIO_COLUMNS: ColumnMap<NewGoalScenario> = {
  name: 'name',
  color: 'color',
  sortOrder: 'sort_order',
  startInvestedCents: 'start_invested_cents',
  monthlyContributionCents: 'monthly_contribution_cents',
  annualContributionGrowth: 'annual_contribution_growth',
  expectedRealReturn: 'expected_real_return',
  horizonYears: 'horizon_years',
  housePriceCents: 'house_price_cents',
  downPaymentFraction: 'down_payment_fraction',
  housePurchaseYear: 'house_purchase_year',
  transactionCostsCents: 'transaction_costs_cents',
  mortgageTermYears: 'mortgage_term_years',
  mortgageRateAnnual: 'mortgage_rate_annual',
  houseAppreciationRate: 'house_appreciation_rate',
  rentMonthlyCents: 'rent_monthly_cents',
  annualSpendCents: 'annual_spend_cents',
  safeWithdrawalRate: 'safe_withdrawal_rate',
}

const coerceScenario: Coerce<NewGoalScenario> = (_k, v) => v ?? null

export async function createScenario(
  env: Env,
  owner: string,
  input: NewGoalScenario,
): Promise<GoalScenario> {
  if (!input.name?.trim()) throw new HttpError(400, 'Scenario name is required')
  const row = await env.DB.prepare(
    `INSERT INTO goal_scenarios (
       owner, name, color, sort_order,
       start_invested_cents, monthly_contribution_cents, annual_contribution_growth,
       expected_real_return, horizon_years,
       house_price_cents, down_payment_fraction, house_purchase_year, transaction_costs_cents,
       mortgage_term_years, mortgage_rate_annual, house_appreciation_rate,
       rent_monthly_cents, annual_spend_cents, safe_withdrawal_rate
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  )
    .bind(
      owner,
      input.name.trim(),
      input.color,
      input.sortOrder,
      input.startInvestedCents,
      input.monthlyContributionCents,
      input.annualContributionGrowth,
      input.expectedRealReturn,
      input.horizonYears,
      input.housePriceCents,
      input.downPaymentFraction,
      input.housePurchaseYear,
      input.transactionCostsCents,
      input.mortgageTermYears,
      input.mortgageRateAnnual,
      input.houseAppreciationRate,
      input.rentMonthlyCents,
      input.annualSpendCents,
      input.safeWithdrawalRate,
    )
    .first<GoalScenarioRow>()
  if (!row) throw new HttpError(500, 'Scenario insert failed')
  return toGoalScenario(row)
}

export async function updateScenario(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewGoalScenario>,
): Promise<GoalScenario> {
  const { sets, values } = buildUpdate(SCENARIO_COLUMNS, patch, coerceScenario)
  const row = await env.DB.prepare(
    `UPDATE goal_scenarios SET ${sets}, updated_at = datetime('now')
     WHERE id = ? AND owner = ? RETURNING *`,
  )
    .bind(...values, id, owner)
    .first<GoalScenarioRow>()
  if (!row) throw new HttpError(404, 'Scenario not found')
  return toGoalScenario(row)
}

export async function deleteScenario(env: Env, owner: string, id: number): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM goal_scenarios WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run()
  if (result.meta.changes === 0) throw new HttpError(404, 'Scenario not found')
}
