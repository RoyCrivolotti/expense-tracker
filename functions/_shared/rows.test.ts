import { describe, expect, it } from 'vitest'
import { toGoalScenario, toSettings, type GoalScenarioRow, type SettingsRow } from './rows'
import { defaultMilestones } from '../../src/domain/engine'

function baseRow(overrides: Partial<GoalScenarioRow> = {}): GoalScenarioRow {
  return {
    id: 1,
    name: 'Test',
    color: '#6366f1',
    sort_order: 0,
    start_invested_cents: 10_000_000,
    monthly_contribution_cents: 100_000,
    annual_contribution_growth: 0,
    expected_real_return: 0.07,
    horizon_years: 30,
    house_price_cents: 0,
    down_payment_fraction: 0,
    house_purchase_year: null,
    transaction_costs_cents: 0,
    mortgage_term_years: 30,
    mortgage_rate_annual: 0.03,
    house_appreciation_rate: 0.025,
    rent_monthly_cents: 0,
    annual_spend_cents: 0,
    safe_withdrawal_rate: 0.04,
    plan_start_date: null,
    life_events: '[]',
    ...overrides,
  }
}

describe('toGoalScenario', () => {
  it('maps a row with empty life_events to lifeEvents: []', () => {
    const result = toGoalScenario(baseRow())
    expect(result.lifeEvents).toEqual([])
  })

  it('parses a JSON life_events array correctly', () => {
    const events = [
      { year: 3, amountCents: 10_000_000, label: 'Bonus' },
      { year: 7, amountCents: -5_000_000, label: 'Car' },
    ]
    const result = toGoalScenario(baseRow({ life_events: JSON.stringify(events) }))
    expect(result.lifeEvents).toEqual(events)
  })

  it('falls back to [] for malformed life_events JSON', () => {
    const result = toGoalScenario(baseRow({ life_events: 'not-json' }))
    expect(result.lifeEvents).toEqual([])
  })

  it('maps plan_start_date null correctly', () => {
    const result = toGoalScenario(baseRow())
    expect(result.planStartDate).toBeNull()
  })

  it('maps a non-null plan_start_date', () => {
    const result = toGoalScenario(baseRow({ plan_start_date: '2024-01-01' }))
    expect(result.planStartDate).toBe('2024-01-01')
  })
})

function settingsRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    opening_cash_cents: 0,
    opening_investment_cents: 0,
    liquid_net_worth_cents: 0,
    default_account_id: null,
    currency_code: null,
    number_locale: null,
    budget_rollover_day: null,
    milestones: null,
    ...overrides,
  }
}

describe('toSettings milestones', () => {
  it('falls back to the built-in ladder when the column is NULL', () => {
    expect(toSettings(settingsRow()).milestones).toEqual(defaultMilestones())
  })

  it('reads a stored ladder', () => {
    const stored = [{ amountCents: 5_000_000, label: 'Emergency fund' }]
    expect(toSettings(settingsRow({ milestones: JSON.stringify(stored) })).milestones).toEqual(
      stored,
    )
  })

  it('preserves a deliberately empty ladder', () => {
    expect(toSettings(settingsRow({ milestones: '[]' })).milestones).toEqual([])
  })

  it('reads defaults when the column is absent, so code can deploy before migration 0014', () => {
    const preMigration = settingsRow()
    delete (preMigration as Partial<SettingsRow>).milestones
    expect(toSettings(preMigration).milestones).toEqual(defaultMilestones())
  })
})
