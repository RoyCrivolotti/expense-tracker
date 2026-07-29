import { describe, expect, it, vi } from 'vitest'
import { updateSettings } from './dbConfig'
import { HttpError } from './http'
import type { Env } from './env'
import type { SettingsRow } from './rows'

const OWNER = 'test@example.com'

function makeRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
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

function stubEnv(returnRow: SettingsRow) {
  const first = vi.fn().mockResolvedValue(returnRow)
  const run = vi.fn().mockResolvedValue(undefined)
  const bind = vi.fn((..._args: unknown[]) => ({ first, run }))
  const prepare = vi.fn(() => ({ bind }))
  return { env: { DB: { prepare } } as unknown as Env, bind, first }
}

/** The bound value for the UPDATE statement's single milestones column. */
function boundMilestones(bind: ReturnType<typeof stubEnv>['bind']): unknown {
  const updateCall = bind.mock.calls.find((args) => typeof args[0] === 'string' && args.length === 2)
  return updateCall?.[0]
}

describe('updateSettings with milestones', () => {
  it('serializes the list to JSON sorted ascending', async () => {
    const sorted = [
      { amountCents: 10_000_000, label: 'First' },
      { amountCents: 20_000_000, label: 'Second' },
    ]
    const { env, bind } = stubEnv(makeRow({ milestones: JSON.stringify(sorted) }))

    const result = await updateSettings(env, OWNER, {
      milestones: [
        { amountCents: 20_000_000, label: 'Second' },
        { amountCents: 10_000_000, label: 'First' },
      ],
    })

    expect(boundMilestones(bind)).toBe(JSON.stringify(sorted))
    expect(result.milestones).toEqual(sorted)
  })

  it('serializes a deliberately empty list to "[]" rather than null', async () => {
    const { env, bind } = stubEnv(makeRow({ milestones: '[]' }))

    const result = await updateSettings(env, OWNER, { milestones: [] })

    expect(boundMilestones(bind)).toBe('[]')
    expect(result.milestones).toEqual([])
  })

  it('rejects an invalid milestone amount with a 400', async () => {
    const { env } = stubEnv(makeRow())

    await expect(
      updateSettings(env, OWNER, { milestones: [{ amountCents: -1, label: '' }] }),
    ).rejects.toBeInstanceOf(HttpError)
  })

  it('rejects a milestone list that is not an array with a 400', async () => {
    const { env } = stubEnv(makeRow())

    await expect(
      updateSettings(env, OWNER, { milestones: 'nope' as unknown as [] }),
    ).rejects.toThrow(/must be an array/)
  })

  it('leaves other settings patches untouched by the milestone branch', async () => {
    const { env } = stubEnv(makeRow({ opening_cash_cents: 5000 }))

    const result = await updateSettings(env, OWNER, { openingCashCents: 5000 })

    expect(result.openingCashCents).toBe(5000)
  })
})
