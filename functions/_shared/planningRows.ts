import type {
  GoalScenario,
  InstallmentPlan,
  LifeEvent,
  TxnType,
  WealthAccount,
  WealthAccountKind,
  WealthCheckin,
  WealthCheckinEntry,
} from '../domain/types'
import { parseContributionSchedule } from '../domain/engine/contributionSchedule'
import { lifeEventsFrom } from '../domain/engine/lifeEvents'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS } from '../domain/engine/projectionConstants'

export interface GoalScenarioRow {
  id: number
  name: string
  color: string
  sort_order: number
  start_invested_cents: number
  monthly_contribution_cents: number
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
  plan_start_date: string | null
  life_events: string
  /** Undefined on a database that has not had the column added yet. */
  contribution_schedule?: string | null
  /** Undefined on a database that has not had the column added yet. */
  home_carry_rate?: number | null
  /** Undefined on a database that has not had the column added yet. */
  retirement_years?: number | null
  is_active: number
}

/**
 * A scenario as the API sends it: the client's own type, and for one release `annualContributionGrowth`, which
 * the client no longer has. A client opened before the field was dropped (an installed app keeps its old code
 * until its owner taps the update banner) multiplies it into every projection, and undefined makes the net worth
 * NaN from year 2. The column still exists with its default of 0, so 0 is what it would have read. Drop this
 * once every client in use is newer than the release that removed the field.
 */
export type GoalScenarioDto = GoalScenario & { annualContributionGrowth: 0 }

export function toGoalScenario(r: GoalScenarioRow): GoalScenarioDto {
  let lifeEvents: LifeEvent[] = []
  try {
    lifeEvents = lifeEventsFrom(JSON.parse(r.life_events))
  } catch {
    // malformed JSON falls back to empty
  }
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
    startInvestedCents: r.start_invested_cents,
    monthlyContributionCents: r.monthly_contribution_cents,
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
    planStartDate: r.plan_start_date ?? null,
    lifeEvents,
    contributionSchedule: parseContributionSchedule(r.contribution_schedule),
    homeCarryRate: r.home_carry_rate ?? DEFAULT_HOME_CARRY_RATE,
    retirementYears: r.retirement_years ?? DEFAULT_RETIREMENT_YEARS,
    isActive: r.is_active === 1,
    annualContributionGrowth: 0,
  }
}

export interface WealthAccountRow {
  id: number
  name: string
  kind: WealthAccountKind
  sort_order: number
  archived: number
}

export function toWealthAccount(r: WealthAccountRow): WealthAccount {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    sortOrder: r.sort_order,
    archived: r.archived === 1,
  }
}

export interface WealthCheckinRow {
  id: number
  checkin_date: string
  note: string | null
  created_at: string
}

export interface WealthCheckinEntryRow {
  account_id: number
  value_cents: number
}

export function toWealthCheckin(
  r: WealthCheckinRow,
  entries: WealthCheckinEntry[],
): WealthCheckin {
  return {
    id: r.id,
    checkinDate: r.checkin_date,
    ...(r.note ? { note: r.note } : {}),
    createdAt: r.created_at,
    entries,
  }
}

export function toWealthCheckinEntry(r: WealthCheckinEntryRow): WealthCheckinEntry {
  return { accountId: r.account_id, valueCents: r.value_cents }
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
