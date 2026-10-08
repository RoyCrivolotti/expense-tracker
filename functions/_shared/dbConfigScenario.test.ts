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

describe('updateScenario with contributionSchedule', () => {
  it('writes the schedule to its own column as JSON, and reads the saved row back', async () => {
    const schedule = [{ from: '2028-03', monthlyCents: 250_000 }]
    const binds: unknown[][] = []
    const sqls: string[] = []
    const first = vi.fn().mockResolvedValue(makeRow({ contribution_schedule: JSON.stringify(schedule) }))
    const prepare = vi.fn((sql: string) => {
      sqls.push(sql)
      return {
        bind: (...args: unknown[]) => {
          binds.push(args)
          return { first }
        },
      }
    })
    const env = { DB: { prepare } } as unknown as Env

    const result = await updateScenario(env, 'test@example.com', 1, { contributionSchedule: schedule })

    expect(sqls[0]).toMatch(/SET contribution_schedule = \?/)
    expect(binds[0]).toEqual([JSON.stringify(schedule), 1, 'test@example.com'])
    expect(result.contributionSchedule).toEqual(schedule)
  })

  it('writes an emptied schedule as "[]", never as NULL, which the column refuses', async () => {
    const binds: unknown[][] = []
    const first = vi.fn().mockResolvedValue(makeRow())
    const prepare = vi.fn(() => ({
      bind: (...args: unknown[]) => {
        binds.push(args)
        return { first }
      },
    }))
    const env = { DB: { prepare } } as unknown as Env

    await updateScenario(env, 'test@example.com', 1, { contributionSchedule: [] })

    expect(binds[0]![0]).toBe('[]')
  })
})
