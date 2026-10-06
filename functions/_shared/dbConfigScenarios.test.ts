import { describe, expect, it, vi } from 'vitest'
import type { Env } from './env'
import { activateScenario, createScenario } from './dbConfig'
import type { GoalScenarioRow } from './rows'

const OWNER = 'test@example.com'

function row(overrides: Partial<GoalScenarioRow> = {}): GoalScenarioRow {
  return {
    id: 7,
    name: 'Plan',
    color: '#6366f1',
    sort_order: 0,
    start_invested_cents: 0,
    monthly_contribution_cents: 100_000,
    annual_contribution_growth: 0,
    expected_real_return: 0.07,
    horizon_years: 30,
    house_price_cents: 0,
    down_payment_fraction: 0.2,
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
    is_active: 1,
    ...overrides,
  }
}

/** A D1 stub that records every prepared statement and its bound values. */
function stubEnv(opts: { batchResults?: unknown[]; firstRow?: GoalScenarioRow | null } = {}) {
  const statements: { sql: string; values: unknown[] }[] = []
  const first = vi.fn().mockResolvedValue(opts.firstRow ?? null)
  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => {
      const stmt = { sql, values, first }
      statements.push(stmt)
      return stmt
    },
  }))
  const batch = vi.fn().mockResolvedValue(opts.batchResults ?? [])
  return { env: { DB: { prepare, batch } } as unknown as Env, statements, batch }
}

describe('activateScenario', () => {
  it('clears the old plan before setting the new one, in one batch', async () => {
    const { env, statements, batch } = stubEnv({
      batchResults: [{ results: [] }, { results: [row({ id: 7 })] }],
    })

    const result = await activateScenario(env, OWNER, 7)

    expect(batch).toHaveBeenCalledOnce()
    expect(statements.map((s) => s.sql.replace(/\s+/g, ' ').trim())).toEqual([
      'UPDATE goal_scenarios SET is_active = 0 WHERE owner = ? AND is_active = 1 AND EXISTS (SELECT 1 FROM goal_scenarios WHERE id = ? AND owner = ?)',
      "UPDATE goal_scenarios SET is_active = 1, updated_at = datetime('now') WHERE id = ? AND owner = ? RETURNING *",
    ])
    // Only cleared when the target is this owner's, so a 404 leaves the current plan alone.
    expect(statements[0]?.values).toEqual([OWNER, 7, OWNER])
    expect(statements[1]?.values).toEqual([7, OWNER])
    expect(result.isActive).toBe(true)
  })

  it('is a 404 when the row is not the owner\'s', async () => {
    const { env } = stubEnv({ batchResults: [{ results: [] }, { results: [] }] })

    await expect(activateScenario(env, OWNER, 7)).rejects.toMatchObject({
      status: 404,
      message: 'Scenario not found',
    })
  })
})

describe('createScenario', () => {
  it('lets the database decide whether the new row is the plan, keyed on the owner', async () => {
    const { env, statements } = stubEnv({ firstRow: row({ id: 8, is_active: 1 }) })

    const created = await createScenario(env, OWNER, {
      name: 'Path A',
      color: '#6366f1',
      sortOrder: 0,
      startInvestedCents: 0,
      monthlyContributionCents: 100_000,
      annualContributionGrowth: 0,
      expectedRealReturn: 0.07,
      horizonYears: 30,
      housePriceCents: 0,
      downPaymentFraction: 0.2,
      housePurchaseYear: null,
      transactionCostsCents: 0,
      mortgageTermYears: 30,
      mortgageRateAnnual: 0.03,
      houseAppreciationRate: 0.025,
      rentMonthlyCents: 0,
      annualSpendCents: 0,
      safeWithdrawalRate: 0.04,
      planStartDate: null,
      lifeEvents: [],
      contributionSchedule: [],
    })

    const insert = statements[0]!
    expect(insert.sql).toMatch(/is_active/)
    expect(insert.sql).toMatch(/CASE WHEN EXISTS \(SELECT 1 FROM goal_scenarios WHERE owner = \? AND is_active = 1\)/)
    // The owner is bound twice: once for the row, once for the EXISTS check.
    expect(insert.values[0]).toBe(OWNER)
    expect(insert.values[insert.values.length - 1]).toBe(OWNER)
    expect(created.isActive).toBe(true)
  })

  it('binds every column to its own value: one placeholder each, the schedule beside the life events', async () => {
    const { env, statements } = stubEnv({ firstRow: row({ id: 9 }) })
    const events = [{ year: 2, amountCents: 5_000_00, label: 'Gift' }]
    const schedule = [{ from: '2028-03', monthlyCents: 250_000 }]

    await createScenario(env, OWNER, {
      name: 'Path A',
      color: '#abcdef',
      sortOrder: 4,
      startInvestedCents: 111,
      monthlyContributionCents: 222,
      annualContributionGrowth: 0.01,
      expectedRealReturn: 0.02,
      horizonYears: 33,
      housePriceCents: 444,
      downPaymentFraction: 0.5,
      housePurchaseYear: 7,
      transactionCostsCents: 555,
      mortgageTermYears: 25,
      mortgageRateAnnual: 0.03,
      houseAppreciationRate: 0.04,
      rentMonthlyCents: 666,
      annualSpendCents: 777,
      safeWithdrawalRate: 0.05,
      planStartDate: '2026-06-25',
      lifeEvents: events,
      contributionSchedule: schedule,
    })

    const { sql, values } = statements[0]!
    const columns = sql
      .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
      .split(',')
      .map((c) => c.trim())
    // Every column but is_active has a placeholder of its own; is_active is the CASE, with one more.
    const placeholders = (sql.match(/\?/g) ?? []).length
    expect(placeholders).toBe(values.length)
    expect(columns.length).toBe(values.length)
    expect(columns[columns.length - 1]).toBe('is_active')

    const bound = (column: string) => values[columns.indexOf(column)]
    expect(bound('owner')).toBe(OWNER)
    expect(bound('name')).toBe('Path A')
    expect(bound('start_invested_cents')).toBe(111)
    expect(bound('safe_withdrawal_rate')).toBe(0.05)
    expect(bound('life_events')).toBe(JSON.stringify(events))
    expect(bound('contribution_schedule')).toBe(JSON.stringify(schedule))
    expect(bound('plan_start_date')).toBe('2026-06-25')
  })
})
