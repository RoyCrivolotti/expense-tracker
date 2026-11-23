import type { ExpenseSettings, Milestone } from '../domain/types'
import { settingsPatchError } from '../domain/settingsChecks'
import { normalizeMilestones, validateMilestones } from '../domain/engine/milestones'
import { buildUpdate, type ColumnMap, type Coerce } from './dbUpdate'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedAccount, assertOwnedCategory } from './ownership'
import { toSettings, type SettingsRow } from './rows'

const SETTINGS_COLUMNS: ColumnMap<ExpenseSettings> = {
  claimantName: 'claimant_name',
  openingCashCents: 'opening_cash_cents',
  openingInvestmentCents: 'opening_investment_cents',
  defaultAccountId: 'default_account_id',
  investmentCategoryId: 'investment_category_id',
  currencyCode: 'currency_code',
  numberLocale: 'number_locale',
  budgetRolloverDay: 'budget_rollover_day',
  milestones: 'milestones',
  cashReserveMonths: 'cash_reserve_months',
  assumedInflation: 'assumed_inflation',
  marketVolatility: 'market_volatility',
  goalLevers: 'goal_levers',
  tipsSeen: 'tips_seen',
}
const NULLABLE_SETTINGS = new Set<keyof ExpenseSettings>([
  'claimantName',
  'defaultAccountId',
  'investmentCategoryId',
  'currencyCode',
  'numberLocale',
  'budgetRolloverDay',
  'milestones',
  'cashReserveMonths',
  'assumedInflation',
  'marketVolatility',
  'goalLevers',
  'tipsSeen',
])
/** Five years of spending in cash is already absurd; past it the number is a typo. */
export const CASH_RESERVE_MAX_MONTHS = 60
const coerceSettings: Coerce<ExpenseSettings> = (
  key,
  value,
) => {
  if (key === 'milestones') {
    return value === undefined ? null : JSON.stringify(normalizeMilestones(value as Milestone[]))
  }
  if (key === 'goalLevers' || key === 'tipsSeen') return value === undefined ? null : JSON.stringify(value)
  return NULLABLE_SETTINGS.has(key) ? (value ?? null) : (value ?? 0)
}

/** The Goals tab's own settings (the cash reserve target here, the rest in `settingsPatchError`) and the tips put away. */
function assertGoalsSettings(patch: Partial<ExpenseSettings>): void {
  if (
    patch.cashReserveMonths !== undefined &&
    (!Number.isInteger(patch.cashReserveMonths) ||
      patch.cashReserveMonths < 0 ||
      patch.cashReserveMonths > CASH_RESERVE_MAX_MONTHS)
  ) {
    throw new HttpError(400, `cashReserveMonths must be an integer between 0 and ${CASH_RESERVE_MAX_MONTHS}`)
  }
  const error = settingsPatchError(patch)
  if (error) throw new HttpError(400, error)
}

/** No balance is more than this, in cents: a hundred billion euros. */
const MAX_OPENING_CENTS = 1e13

/**
 * What the books start from: whole cents, and not past the ceiling either way. The investments cannot start below zero,
 * and cash can (an overdrawn account), so only the investments are held to zero or more.
 */
function assertOpeningBalances(patch: Partial<ExpenseSettings>): void {
  const invested = patch.openingInvestmentCents
  if (invested !== undefined && (!Number.isSafeInteger(invested) || invested < 0 || invested > MAX_OPENING_CENTS)) {
    throw new HttpError(
      400,
      'openingInvestmentCents must be a whole number of cents, zero or more, at most a hundred billion euros',
    )
  }
  const cash = patch.openingCashCents
  if (cash !== undefined && (!Number.isSafeInteger(cash) || Math.abs(cash) > MAX_OPENING_CENTS)) {
    throw new HttpError(
      400,
      'openingCashCents must be a whole number of cents, a hundred billion euros at most either way',
    )
  }
}

/** The scalar checks that need no database; the account check stays with the query. */
function assertSettingsPatch(patch: Partial<ExpenseSettings>): void {
  assertOpeningBalances(patch)
  if (
    patch.budgetRolloverDay != null &&
    (!Number.isInteger(patch.budgetRolloverDay) || patch.budgetRolloverDay < 1 || patch.budgetRolloverDay > 28)
  ) {
    throw new HttpError(400, 'budgetRolloverDay must be between 1 and 28')
  }
  if (patch.milestones !== undefined) {
    const error = validateMilestones(patch.milestones)
    if (error) throw new HttpError(400, error)
  }
  assertGoalsSettings(patch)
}

export async function updateSettings(
  env: Env,
  owner: string,
  patch: Partial<ExpenseSettings>,
): Promise<ExpenseSettings> {
  if (patch.defaultAccountId != null) {
    await assertOwnedAccount(env, owner, patch.defaultAccountId)
  }
  if (patch.investmentCategoryId != null) {
    await assertOwnedCategory(env, owner, patch.investmentCategoryId)
  }
  assertSettingsPatch(patch)
  const { sets, values } = buildUpdate(SETTINGS_COLUMNS, patch, coerceSettings)
  await env.DB.prepare('INSERT OR IGNORE INTO settings (owner) VALUES (?)').bind(owner).run()
  const row = await env.DB.prepare(`UPDATE settings SET ${sets} WHERE owner = ? RETURNING *`)
    .bind(...values, owner)
    .first<SettingsRow>()
  if (!row) throw new HttpError(500, 'Settings update failed')
  return toSettings(row)
}
