import { describe, expect, it } from 'vitest'
import { createScenario, patchScenario, validateScenarioNumbers } from './goalService'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { makeScenario } from '../../testing/factories'
import type { NewGoalScenario } from '../data/dataSource'

const OWNER = 'owner@example.com'

/** A scenario as the API receives it: everything but the id. */
function newScenario(overrides: Partial<NewGoalScenario> = {}): NewGoalScenario {
  const scenario: Record<string, unknown> = { ...makeScenario(), ...overrides }
  delete scenario.id
  return scenario as unknown as NewGoalScenario
}

describe('validateScenarioNumbers', () => {
  it('refuses a withdrawal rate of zero, which makes the FI target infinite', () => {
    // fireNumber returns Infinity for swr <= 0 by design, so this is the value that
    // put a non-number on the Goals screen. The UI's slider stops at 0.005; nothing
    // between the API and SQLite did.
    expect(() => validateScenarioNumbers({ safeWithdrawalRate: 0 })).toThrow(
      'safeWithdrawalRate must be greater than 0 and at most 1',
    )
    expect(() => validateScenarioNumbers({ safeWithdrawalRate: -0.04 })).toThrow()
    expect(() => validateScenarioNumbers({ safeWithdrawalRate: 1.5 })).toThrow()
  })

  it('refuses a horizon that cannot be projected over', () => {
    expect(() => validateScenarioNumbers({ horizonYears: 0 })).toThrow(
      'horizonYears must be a whole number of years, at least 1',
    )
    expect(() => validateScenarioNumbers({ horizonYears: 12.5 })).toThrow()
  })

  it('refuses negative or fractional amounts', () => {
    expect(() => validateScenarioNumbers({ startInvestedCents: -1 })).toThrow()
    expect(() => validateScenarioNumbers({ annualSpendCents: 10.5 })).toThrow()
  })

  it('refuses a down-payment fraction outside 0 to 1', () => {
    expect(() => validateScenarioNumbers({ downPaymentFraction: 1.2 })).toThrow()
    expect(() => validateScenarioNumbers({ downPaymentFraction: -0.1 })).toThrow()
  })

  it('refuses a rate that is not a number, including one sent as a string', () => {
    expect(() =>
      validateScenarioNumbers({ expectedRealReturn: '0.07' as unknown as number }),
    ).toThrow('expectedRealReturn must be a number')
  })

  it('allows a negative expected return, which is a real scenario to model', () => {
    expect(() => validateScenarioNumbers({ expectedRealReturn: -0.02 })).not.toThrow()
  })

  it('allows the ranges the sliders offer, and a little beyond them', () => {
    // Deliberately wider than the UI: these bounds are the engine's, not the slider's.
    expect(() =>
      validateScenarioNumbers({ horizonYears: 50, safeWithdrawalRate: 0.12 }),
    ).not.toThrow()
  })

  it('ignores fields a patch does not carry', () => {
    expect(() => validateScenarioNumbers({ name: 'Just a rename' })).not.toThrow()
  })
})

describe('the scenario write paths', () => {
  it('rejects the bad value on create', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    await expect(
      createScenario(repo, OWNER, newScenario({ safeWithdrawalRate: 0 })),
    ).rejects.toThrow('safeWithdrawalRate')
  })

  it('rejects it on edit too, which is the path that had no checks at all', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario())

    await expect(
      patchScenario(repo, OWNER, saved.id, { safeWithdrawalRate: 0 }),
    ).rejects.toThrow('safeWithdrawalRate')
  })

  it('still saves a legitimate scenario', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario({ safeWithdrawalRate: 0.035 }))

    expect(saved.safeWithdrawalRate).toBe(0.035)
    const patched = await patchScenario(repo, OWNER, saved.id, { horizonYears: 25 })
    expect(patched.horizonYears).toBe(25)
  })

  it('saves the purchase year the slider calls "Now"', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario({ housePurchaseYear: 0 }))

    expect(saved.housePurchaseYear).toBe(0)
    const patched = await patchScenario(repo, OWNER, saved.id, { housePurchaseYear: 0 })
    expect(patched.housePurchaseYear).toBe(0)
  })
})
