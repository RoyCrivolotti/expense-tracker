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
    default_account_id: null,
    investment_category_id: null,
    currency_code: null,
    number_locale: null,
    budget_rollover_day: null,
    milestones: null,
    claimant_name: null,
    cash_reserve_months: null,
    assumed_inflation: null,
    market_volatility: null,
    goal_levers: null,
    ...overrides,
  }
}

describe('updateSettings with investmentCategoryId', () => {
  it('checks the category is the owner\'s before saving it', async () => {
    const { env, bind } = stubEnv(makeRow({ investment_category_id: 4 }))
    await expect(updateSettings(env, OWNER, { investmentCategoryId: 4 })).resolves.toMatchObject({
      investmentCategoryId: 4,
    })
    // The ownership check binds the category id with the owner before the UPDATE.
    expect(bind.mock.calls.some((args) => args[0] === 4 && args[1] === OWNER)).toBe(true)
  })

  it('clears the choice with null', async () => {
    const { env } = stubEnv(makeRow({ investment_category_id: null }))
    await expect(updateSettings(env, OWNER, { investmentCategoryId: null })).resolves.toMatchObject({
      investmentCategoryId: null,
    })
  })
})

describe('updateSettings with cashReserveMonths', () => {
  it('accepts a whole number of months up to five years, and nothing else', async () => {
    const { env } = stubEnv(makeRow({ cash_reserve_months: 6 }))
    await expect(updateSettings(env, OWNER, { cashReserveMonths: 6 })).resolves.toMatchObject({
      cashReserveMonths: 6,
    })
    for (const bad of [-1, 2.5, 61]) {
      await expect(updateSettings(env, OWNER, { cashReserveMonths: bad })).rejects.toBeInstanceOf(HttpError)
    }
  })
})

describe('updateSettings with assumedInflation', () => {
  it('accepts a yearly fraction from none up to ten percent, and nothing else', async () => {
    const { env } = stubEnv(makeRow({ assumed_inflation: 0.035 }))
    await expect(updateSettings(env, OWNER, { assumedInflation: 0.035 })).resolves.toMatchObject({
      assumedInflation: 0.035,
    })
    for (const ok of [0, 0.1]) {
      await expect(updateSettings(env, OWNER, { assumedInflation: ok })).resolves.toBeDefined()
    }
    for (const bad of [-0.01, 0.11, NaN, '0.02' as unknown as number, null as unknown as number]) {
      await expect(updateSettings(env, OWNER, { assumedInflation: bad })).rejects.toBeInstanceOf(HttpError)
    }
  })

  it('reads as 2% until one is set, including on a database without the column', async () => {
    const { env } = stubEnv(makeRow({ assumed_inflation: null }))
    await expect(updateSettings(env, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({
      assumedInflation: 0.02,
    })
    // A row from before the migration has no such key at all.
    const { assumed_inflation: omitted, ...before } = makeRow()
    void omitted
    const { env: oldEnv } = stubEnv(before as SettingsRow)
    await expect(updateSettings(oldEnv, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({
      assumedInflation: 0.02,
    })
  })
})

describe('updateSettings with marketVolatility', () => {
  it('accepts a yearly spread from none up to half, and nothing else', async () => {
    const { env } = stubEnv(makeRow({ market_volatility: 0.11 }))
    await expect(updateSettings(env, OWNER, { marketVolatility: 0.11 })).resolves.toMatchObject({ marketVolatility: 0.11 })
    for (const ok of [0, 0.5]) {
      await expect(updateSettings(env, OWNER, { marketVolatility: ok })).resolves.toBeDefined()
    }
    for (const bad of [-0.01, 0.51, NaN, '0.15' as unknown as number, null as unknown as number]) {
      await expect(updateSettings(env, OWNER, { marketVolatility: bad })).rejects.toBeInstanceOf(HttpError)
    }
  })

  it('reads as 15% until one is set, including on a database without the column', async () => {
    const { env } = stubEnv(makeRow({ market_volatility: null }))
    await expect(updateSettings(env, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({ marketVolatility: 0.15 })
    const { market_volatility: omitted, ...before } = makeRow()
    void omitted
    const { env: oldEnv } = stubEnv(before as SettingsRow)
    await expect(updateSettings(oldEnv, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({ marketVolatility: 0.15 })
  })

  it('keeps zero, which is a spread of none and not a missing one', async () => {
    const { env } = stubEnv(makeRow({ market_volatility: 0 }))
    await expect(updateSettings(env, OWNER, { marketVolatility: 0 })).resolves.toMatchObject({ marketVolatility: 0 })
  })
})

describe('updateSettings with goalLevers', () => {
  it('stores the list as JSON in the order it was given, and reads it back', async () => {
    const chosen = ['rentMonthlyCents', 'horizonYears']
    const { env, bind } = stubEnv(makeRow({ goal_levers: JSON.stringify(chosen) }))

    const result = await updateSettings(env, OWNER, { goalLevers: ['rentMonthlyCents', 'horizonYears'] })

    expect(boundMilestones(bind)).toBe(JSON.stringify(chosen))
    expect(result.goalLevers).toEqual(chosen)
  })

  it('stores a deliberately empty list as "[]", which is not the same as never having chosen', async () => {
    const { env, bind } = stubEnv(makeRow({ goal_levers: '[]' }))

    const result = await updateSettings(env, OWNER, { goalLevers: [] })

    expect(boundMilestones(bind)).toBe('[]')
    expect(result.goalLevers).toEqual([])
  })

  it('refuses a sixth input, an input a scenario does not have, a repeat and what is not a list', async () => {
    const { env } = stubEnv(makeRow())
    const six = [
      'startInvestedCents',
      'monthlyContributionCents',
      'expectedRealReturn',
      'horizonYears',
      'housePurchaseYear',
      'rentMonthlyCents',
    ]
    for (const bad of [six, ['planStartDate'], ['horizonYears', 'horizonYears'], 'horizonYears', null]) {
      await expect(
        updateSettings(env, OWNER, { goalLevers: bad as unknown as [] }),
      ).rejects.toBeInstanceOf(HttpError)
    }
  })

  it('reads as the five defaults until one is chosen, including on a database without the column', async () => {
    const { env } = stubEnv(makeRow({ goal_levers: null }))
    const defaults = ['monthlyContributionCents', 'expectedRealReturn', 'horizonYears', 'housePurchaseYear', 'startInvestedCents']
    await expect(updateSettings(env, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({ goalLevers: defaults })
    // A row from before the migration has no such key at all.
    const { goal_levers: omitted, ...before } = makeRow()
    void omitted
    const { env: oldEnv } = stubEnv(before as SettingsRow)
    await expect(updateSettings(oldEnv, OWNER, { claimantName: 'Alex' })).resolves.toMatchObject({ goalLevers: defaults })
  })
})

function stubEnv(returnRow: SettingsRow) {
  const first = vi.fn().mockResolvedValue(returnRow)
  const run = vi.fn().mockResolvedValue(undefined)
  const bind = vi.fn<(...args: unknown[]) => { first: typeof first; run: typeof run }>(() => ({
    first,
    run,
  }))
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
