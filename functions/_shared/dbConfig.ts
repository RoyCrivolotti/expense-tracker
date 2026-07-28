import type {
  Account,
  Category,
  ExpenseSettings,
  GoalInputs,
  GoalScenario,
} from '../domain/types'
import type {
  DeleteAccountOptions,
  DeleteAccountResult,
  DeleteCategoryOptions,
  DeleteCategoryResult,
  NewAccount,
  NewCategory,
  NewGoalScenario,
} from '../domain/data/dataSource'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedAccount, assertOwnedCategory } from './ownership'
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

async function countCategoryUsage(env: Env, owner: string, id: number): Promise<number> {
  const [txns, plans] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installment_plans WHERE category_id = ? AND owner = ?',
    )
      .bind(id, owner)
      .first<{ n: number }>(),
  ])
  return (txns?.n ?? 0) + (plans?.n ?? 0)
}

async function deletePlainCategory(
  env: Env,
  owner: string,
  id: number,
): Promise<DeleteCategoryResult> {
  const usage = await countCategoryUsage(env, owner, id)
  if (usage > 0) throw new HttpError(409, `Category is in use by ${usage} record(s)`)
  const result = await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?')
    .bind(id, owner)
    .run()
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, 'Category not found')
  return { reassignedToId: null }
}

async function resolveCategoryDeleteTarget(
  env: Env,
  owner: string,
  id: number,
  reassignToId: number | undefined,
  createInput: NewCategory | undefined,
): Promise<{ targetId: number; createdCategory?: Category }> {
  if (createInput) {
    const createdCategory = await createCategory(env, owner, createInput)
    return { targetId: createdCategory.id, createdCategory }
  }
  if (reassignToId === id) throw new HttpError(400, 'Cannot reassign a category to itself')
  await assertOwnedCategory(env, owner, reassignToId!)
  return { targetId: reassignToId! }
}

export async function deleteCategory(
  env: Env,
  owner: string,
  id: number,
  options?: DeleteCategoryOptions,
): Promise<DeleteCategoryResult> {
  const { reassignToId, createCategory: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new HttpError(400, 'Specify either reassignToId or createCategory, not both')
  }

  if (reassignToId == null && !createInput) {
    return deletePlainCategory(env, owner, id)
  }

  const { targetId, createdCategory } = await resolveCategoryDeleteTarget(
    env,
    owner,
    id,
    reassignToId,
    createInput,
  )

  try {
    // Move referencing rows and delete the source category as one D1 batch (implicit
    // transaction) so a mid-batch failure never leaves rows reassigned without the
    // source actually being deleted, or vice versa.
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE transactions SET category_id = ? WHERE category_id = ? AND owner = ?',
      ).bind(targetId, id, owner),
      env.DB.prepare(
        'UPDATE installment_plans SET category_id = ? WHERE category_id = ? AND owner = ?',
      ).bind(targetId, id, owner),
      env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?').bind(id, owner),
    ])
    const deleteResult = results[results.length - 1]
    if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Category not found')

    return { reassignedToId: targetId, ...(createdCategory ? { createdCategory } : {}) }
  } catch (err) {
    // Inline-create can't join the batch above — the new category's id isn't known
    // until its own INSERT completes, and D1 batch() statements can't reference an
    // earlier statement's result. So a failure here (batch error, or the source
    // already gone) leaves a just-created, unused category behind; clean it up on a
    // best-effort basis rather than silently leaking it.
    if (createdCategory) await deleteOrphanedCategory(env, owner, createdCategory.id)
    throw err
  }
}

async function deleteOrphanedCategory(env: Env, owner: string, id: number): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner = ?').bind(id, owner).run()
  } catch {
    /* best-effort cleanup; the original error is what the caller should see */
  }
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

async function countAccountUsage(env: Env, owner: string, id: number): Promise<number> {
  const [txns, plans, statements] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installment_plans WHERE account_id = ? AND owner = ?',
    )
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS n FROM account_statements WHERE account_id = ? AND owner = ?',
    )
      .bind(id, owner)
      .first<{ n: number }>(),
  ])
  return (txns?.n ?? 0) + (plans?.n ?? 0) + (statements?.n ?? 0)
}

async function deletePlainAccount(
  env: Env,
  owner: string,
  id: number,
): Promise<DeleteAccountResult> {
  const usage = await countAccountUsage(env, owner, id)
  if (usage > 0) throw new HttpError(409, `Account is in use by ${usage} record(s)`)
  // An unused account can still be settings.defaultAccountId (e.g. set as default, then
  // never actually used) — clear it in the same batch so the delete can't leave it dangling.
  const results = await env.DB.batch([
    env.DB.prepare(
      'UPDATE settings SET default_account_id = NULL WHERE owner = ? AND default_account_id = ?',
    ).bind(owner, id),
    env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner),
  ])
  const deleteResult = results[results.length - 1]
  if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Account not found')
  return { reassignedToId: null }
}

async function resolveAccountDeleteTarget(
  env: Env,
  owner: string,
  id: number,
  reassignToId: number | undefined,
  createInput: NewAccount | undefined,
): Promise<{ targetId: number; createdAccount?: Account }> {
  if (createInput) {
    const createdAccount = await createAccount(env, owner, createInput)
    return { targetId: createdAccount.id, createdAccount }
  }
  if (reassignToId === id) throw new HttpError(400, 'Cannot reassign an account to itself')
  await assertOwnedAccount(env, owner, reassignToId!)
  return { targetId: reassignToId! }
}

export async function deleteAccount(
  env: Env,
  owner: string,
  id: number,
  options?: DeleteAccountOptions,
): Promise<DeleteAccountResult> {
  const { reassignToId, createAccount: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new HttpError(400, 'Specify either reassignToId or createAccount, not both')
  }

  if (reassignToId == null && !createInput) {
    return deletePlainAccount(env, owner, id)
  }

  const { targetId, createdAccount } = await resolveAccountDeleteTarget(
    env,
    owner,
    id,
    reassignToId,
    createInput,
  )

  try {
    // account_statements has a composite key of (owner, account_id, year_month); if the
    // target already has a statement for a month the source also has, moving the source's
    // row would collide with it. Drop the source's row for those overlapping months first
    // (the target's existing paid state wins), then move whatever is left, then the rest
    // of the reassignment + delete — all as one D1 batch so it's all-or-nothing.
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE transactions SET account_id = ? WHERE account_id = ? AND owner = ?',
      ).bind(targetId, id, owner),
      env.DB.prepare(
        'UPDATE installment_plans SET account_id = ? WHERE account_id = ? AND owner = ?',
      ).bind(targetId, id, owner),
      env.DB.prepare(
        `DELETE FROM account_statements
         WHERE owner = ? AND account_id = ?
           AND year_month IN (
             SELECT year_month FROM account_statements WHERE owner = ? AND account_id = ?
           )`,
      ).bind(owner, id, owner, targetId),
      env.DB.prepare(
        'UPDATE account_statements SET account_id = ? WHERE account_id = ? AND owner = ?',
      ).bind(targetId, id, owner),
      // If the deleted account was the configured default, move the default along with
      // everything else — otherwise settings keeps pointing at a row that no longer exists.
      env.DB.prepare(
        'UPDATE settings SET default_account_id = ? WHERE owner = ? AND default_account_id = ?',
      ).bind(targetId, owner, id),
      env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner),
    ])
    const deleteResult = results[results.length - 1]
    if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Account not found')

    return { reassignedToId: targetId, ...(createdAccount ? { createdAccount } : {}) }
  } catch (err) {
    // See the matching comment in deleteCategory: inline-create can't join this batch,
    // so a failure here leaves a just-created, unused account behind. Best-effort cleanup.
    if (createdAccount) await deleteOrphanedAccount(env, owner, createdAccount.id)
    throw err
  }
}

async function deleteOrphanedAccount(env: Env, owner: string, id: number): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner).run()
  } catch {
    /* best-effort cleanup; the original error is what the caller should see */
  }
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
  planStartDate: 'plan_start_date',
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
