import type {
  Account,
  Category,
  ExpenseSettings,
  GoalInputs,
} from '../../src/domain/types'
import type { NewAccount, NewCategory } from '../../src/domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import {
  toAccount,
  toCategory,
  toGoalInputs,
  toSettings,
  type AccountRow,
  type CategoryRow,
  type GoalRow,
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
}
const coerceSettings: Coerce<ExpenseSettings> = (key, value) =>
  key === 'defaultAccountId' ? (value ?? null) : (value ?? 0)

export async function updateSettings(
  env: Env,
  owner: string,
  patch: Partial<ExpenseSettings>,
): Promise<ExpenseSettings> {
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
