import type { GoalScenario } from '../domain/types'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS } from '../domain/engine/projectionConstants'
import type { NewGoalScenario } from '../domain/data/dataSource'
import { buildUpdate, type ColumnMap, type Coerce } from './dbUpdate'
import type { Env } from './env'
import { HttpError } from './http'
import { toGoalScenario, type GoalScenarioRow } from './planningRows'

const SCENARIO_COLUMNS: ColumnMap<NewGoalScenario> = {
  name: 'name',
  color: 'color',
  sortOrder: 'sort_order',
  startInvestedCents: 'start_invested_cents',
  monthlyContributionCents: 'monthly_contribution_cents',
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
  lifeEvents: 'life_events',
  contributionSchedule: 'contribution_schedule',
  homeCarryRate: 'home_carry_rate',
  retirementYears: 'retirement_years',
}

const coerceScenario: Coerce<NewGoalScenario> = (
  k,
  v,
) => {
  if (k === 'lifeEvents' || k === 'contributionSchedule') return JSON.stringify(v ?? [])
  return v ?? null
}

export async function createScenario(
  env: Env,
  owner: string,
  input: NewGoalScenario,
): Promise<GoalScenario> {
  if (!input.name?.trim()) throw new HttpError(400, 'Scenario name is required')
  const row = await env.DB.prepare(
    `INSERT INTO goal_scenarios (
       owner, name, color, sort_order,
       start_invested_cents, monthly_contribution_cents,
       expected_real_return, horizon_years,
       house_price_cents, down_payment_fraction, house_purchase_year, transaction_costs_cents,
       mortgage_term_years, mortgage_rate_annual, house_appreciation_rate,
       rent_monthly_cents, annual_spend_cents, safe_withdrawal_rate, life_events,
       contribution_schedule, home_carry_rate, retirement_years, plan_start_date, is_active
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
       CASE WHEN EXISTS (SELECT 1 FROM goal_scenarios WHERE owner = ? AND is_active = 1)
         THEN 0 ELSE 1 END
     )
     RETURNING *`,
  )
    .bind(
      owner,
      input.name.trim(),
      input.color,
      input.sortOrder,
      input.startInvestedCents,
      input.monthlyContributionCents,
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
      JSON.stringify(input.lifeEvents ?? []),
      JSON.stringify(input.contributionSchedule ?? []),
      // A client that predates the field posts without it, and the column has no NULL.
      input.homeCarryRate ?? DEFAULT_HOME_CARRY_RATE,
      input.retirementYears ?? DEFAULT_RETIREMENT_YEARS,
      // No DEFAULT on this column, and trackStatus() returns null without it — a
      // scenario missing it silently loses its on/off-track badge and chart markers.
      input.planStartDate ?? null,
      // An owner's first scenario is their plan; nobody should have to find the
      // button before Progress means anything.
      owner,
    )
    .first<GoalScenarioRow>()
  if (!row) throw new HttpError(500, 'Scenario insert failed')
  return toGoalScenario(row)
}

export async function activateScenario(
  env: Env,
  owner: string,
  id: number,
): Promise<GoalScenario> {
  // Two statements, not one CASE: SQLite checks the partial unique index row by row,
  // so a single UPDATE that sets the new plan before it clears the old one fails.
  // batch() runs them as one transaction. The first only clears when the target is this
  // owner's, because the 404 below cannot undo it: an unknown id from a stale tab must not
  // leave the owner with no plan at all.
  const [, result] = await env.DB.batch<GoalScenarioRow>([
    env.DB.prepare(
      `UPDATE goal_scenarios SET is_active = 0
       WHERE owner = ? AND is_active = 1
         AND EXISTS (SELECT 1 FROM goal_scenarios WHERE id = ? AND owner = ?)`,
    ).bind(owner, id, owner),
    env.DB.prepare(
      `UPDATE goal_scenarios SET is_active = 1, updated_at = datetime('now')
       WHERE id = ? AND owner = ? RETURNING *`,
    ).bind(id, owner),
  ])
  const row = result?.results?.[0]
  if (!row) throw new HttpError(404, 'Scenario not found')
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

export async function deleteScenario(
  env: Env,
  owner: string,
  id: number,
): Promise<void> {
  const result = await env.DB.prepare('DELETE FROM goal_scenarios WHERE id = ? AND owner = ?').bind(id, owner).run()
  if (result.meta.changes === 0) throw new HttpError(404, 'Scenario not found')
}
