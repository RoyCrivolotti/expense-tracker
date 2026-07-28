import { describe, expect, it, vi } from 'vitest'
import { updateScenario } from './dbConfig'
import type { Env } from './env'
import type { GoalScenarioRow } from './rows'

function makeRow(overrides: Partial<GoalScenarioRow> = {}): GoalScenarioRow {
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

function stubEnv(returnRow: GoalScenarioRow) {
  const first = vi.fn().mockResolvedValue(returnRow)
  const prepare = vi.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    bind: (..._args: unknown[]) => ({ first }),
  }))
  return { env: { DB: { prepare } } as unknown as Env, prepare, first }
}

describe('updateScenario with lifeEvents', () => {
  it('serializes lifeEvents array to JSON when patching', async () => {
    const events = [{ year: 3, amountCents: 10_000_000, label: 'Bonus' }]
    const returnRow = makeRow({ life_events: JSON.stringify(events) })
    const { env, first } = stubEnv(returnRow)

    const result = await updateScenario(env, 'test@example.com', 1, { lifeEvents: events })

    expect(first).toHaveBeenCalled()
    expect(result.lifeEvents).toEqual(events)
  })

  it('serializes empty lifeEvents array to JSON "[]"', async () => {
    const returnRow = makeRow({ life_events: '[]' })
    const { env } = stubEnv(returnRow)

    const result = await updateScenario(env, 'test@example.com', 1, { lifeEvents: [] })

    expect(result.lifeEvents).toEqual([])
  })
})
