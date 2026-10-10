import { describe, expect, it } from 'vitest'
import { isCompatibleSnapshot } from './offlineCache'

describe('isCompatibleSnapshot', () => {
  it('rejects a snapshot written before versioning existed', () => {
    // The real-world case: a user whose cached dataset predates `flags`, which
    // buildLookup would map over and throw on.
    expect(isCompatibleSnapshot({})).toBe(false)
  })

  it('rejects a snapshot from an older schema version', () => {
    expect(isCompatibleSnapshot({ version: 1 })).toBe(false)
    // Version 2 predates `settings.assumedInflation`, which every projection now reads.
    expect(isCompatibleSnapshot({ version: 2 })).toBe(false)
    // Version 3 predates `labels`, which buildLookup now maps over.
    expect(isCompatibleSnapshot({ version: 3 })).toBe(false)
    // Version 4 predates `settings.goalLevers`, which the Goals page reads the length of.
    expect(isCompatibleSnapshot({ version: 4 })).toBe(false)
    // Version 5 predates `GoalScenario.contributionSchedule`, which every projection reads.
    expect(isCompatibleSnapshot({ version: 5 })).toBe(false)
    // Version 6 predates `GoalScenario.homeCarryRate`, which Rent vs buy and the editor's draft read.
    expect(isCompatibleSnapshot({ version: 6 })).toBe(false)
    // Version 7 predates `GoalScenario.retirementYears`, which the drawdown chart and the editor's draft read.
    expect(isCompatibleSnapshot({ version: 7 })).toBe(false)
    // Version 8 predates `settings.marketVolatility`, which the spread card and the Assumptions card read.
    expect(isCompatibleSnapshot({ version: 8 })).toBe(false)
  })

  it('rejects a missing record', () => {
    expect(isCompatibleSnapshot(undefined)).toBe(false)
  })

  it('accepts a snapshot written by this build', () => {
    expect(isCompatibleSnapshot({ version: 9 })).toBe(true)
  })
})
