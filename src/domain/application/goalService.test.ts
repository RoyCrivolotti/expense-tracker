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

describe('the mortgage term', () => {
  it.each([25, 24.58333, 0.5, 1])('accepts %s years, a part of a year included, since a loan can have months left', (years) => {
    expect(() => validateScenarioNumbers({ mortgageTermYears: years })).not.toThrow()
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 101])('refuses %s years', (years) => {
    expect(() => validateScenarioNumbers({ mortgageTermYears: years })).toThrow(
      'mortgageTermYears must be a number of years above 0, at most 100',
    )
  })

  it('still asks for a whole number of years for the horizon', () => {
    expect(() => validateScenarioNumbers({ horizonYears: 25.5 })).toThrow('horizonYears must be a whole number of years, at least 1')
  })
})

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

  it('refuses to rename a scenario to nothing, as it refuses to make one with no name', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario({ name: 'Path A' }))

    await expect(patchScenario(repo, OWNER, saved.id, { name: '' })).rejects.toThrow('Scenario name is required')
    await expect(patchScenario(repo, OWNER, saved.id, { name: '   ', horizonYears: 25 })).rejects.toThrow(
      'Scenario name is required',
    )
    // Nothing of the refused patch was kept.
    const { goalScenarios } = await repo.loadDataset(OWNER)
    expect(goalScenarios[0]).toMatchObject({ name: 'Path A', horizonYears: saved.horizonYears })
  })

  it('trims a new name, and leaves the name alone when the patch has none', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario({ name: 'Path A' }))

    const renamed = await patchScenario(repo, OWNER, saved.id, { name: '  Path B  ' })
    expect(renamed.name).toBe('Path B')
    const untouched = await patchScenario(repo, OWNER, saved.id, { horizonYears: 20 })
    expect(untouched.name).toBe('Path B')
  })

  it('saves a schedule of monthly changes in date order, whatever order it arrives in', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(
      repo,
      OWNER,
      newScenario({
        contributionSchedule: [
          { from: '2028-03', monthlyCents: 250_000 },
          { from: '2027-01', monthlyCents: 0 },
        ],
      }),
    )
    expect(saved.contributionSchedule).toEqual([
      { from: '2027-01', monthlyCents: 0 },
      { from: '2028-03', monthlyCents: 250_000 },
    ])

    const patched = await patchScenario(repo, OWNER, saved.id, {
      contributionSchedule: [
        { from: '2030-01', monthlyCents: 5 },
        { from: '2029-01', monthlyCents: 4 },
      ],
    })
    expect(patched.contributionSchedule.map((s) => s.from)).toEqual(['2029-01', '2030-01'])
  })

  it('refuses a schedule it cannot store, on create and on edit, and keeps what was saved', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const bad = [{ from: '2027-01', monthlyCents: -5 }]
    await expect(createScenario(repo, OWNER, newScenario({ contributionSchedule: bad }))).rejects.toThrow(
      'monthlyCents',
    )

    const saved = await createScenario(
      repo,
      OWNER,
      newScenario({ contributionSchedule: [{ from: '2027-01', monthlyCents: 1_000 }] }),
    )
    await expect(patchScenario(repo, OWNER, saved.id, { contributionSchedule: bad })).rejects.toThrow('monthlyCents')
    await expect(
      patchScenario(repo, OWNER, saved.id, {
        contributionSchedule: [
          { from: '2027-01', monthlyCents: 1 },
          { from: '2027-01', monthlyCents: 2 },
        ],
      }),
    ).rejects.toThrow('two contribution steps start in 2027-01')
    const { goalScenarios } = await repo.loadDataset(OWNER)
    expect(goalScenarios[0]!.contributionSchedule).toEqual([{ from: '2027-01', monthlyCents: 1_000 }])
  })

  it('leaves the schedule alone when a patch does not carry one', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(
      repo,
      OWNER,
      newScenario({ contributionSchedule: [{ from: '2027-01', monthlyCents: 1_000 }] }),
    )
    const patched = await patchScenario(repo, OWNER, saved.id, { horizonYears: 25 })
    expect(patched.contributionSchedule).toEqual([{ from: '2027-01', monthlyCents: 1_000 }])
  })

  it('saves the purchase year the slider calls "Now"', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario({ housePurchaseYear: 0 }))

    expect(saved.housePurchaseYear).toBe(0)
    const patched = await patchScenario(repo, OWNER, saved.id, { housePurchaseYear: 0 })
    expect(patched.housePurchaseYear).toBe(0)
  })
})

describe('the plan', () => {
  it('is the first scenario an owner saves, then whichever one they activate', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const first = await createScenario(repo, OWNER, newScenario({ name: 'First' }))
    const second = await createScenario(repo, OWNER, newScenario({ name: 'Second' }))
    expect(first.isActive).toBe(true)
    expect(second.isActive).toBe(false)

    const activated = await patchScenario(repo, OWNER, second.id, { isActive: true })

    expect(activated.isActive).toBe(true)
    const { goalScenarios } = await repo.loadDataset(OWNER)
    expect(goalScenarios.map((s) => [s.name, s.isActive])).toEqual([
      ['First', false],
      ['Second', true],
    ])
  })

  it('cannot be unset or smuggled into a field patch', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const saved = await createScenario(repo, OWNER, newScenario())

    await expect(patchScenario(repo, OWNER, saved.id, { isActive: false })).rejects.toThrow(
      'isActive can only be set to true',
    )
    await expect(
      patchScenario(repo, OWNER, saved.id, { isActive: true, horizonYears: 20 }),
    ).rejects.toThrow('only on its own')
  })

  it('is a 404 for a scenario the owner does not have', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    await expect(patchScenario(repo, OWNER, 999, { isActive: true })).rejects.toThrow(
      'Scenario not found',
    )
  })
})
