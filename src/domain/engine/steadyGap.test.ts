import { describe, expect, it } from 'vitest'
import { steadyGap } from './steadyGap'
import { planValueAtDate } from './wealthTracking'
import { makeScenario, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'

const accounts = [makeWealthAccount({ id: 1, kind: 'investment' })]
const plan = makeScenario({ id: 1, isActive: true, planStartDate: '2025-01-01' })

/** A check-in sitting `gapCents` off the plan on that date. */
function off(id: number, date: string, gapCents: number) {
  const projected = planValueAtDate(plan, date)!
  return makeWealthCheckin({
    id,
    checkinDate: date,
    entries: [{ accountId: 1, valueCents: projected + gapCents }],
  })
}

describe('steadyGap', () => {
  it('reports a run of check-ins that all sit about the same distance behind', () => {
    const gap = steadyGap(
      [off(1, '2026-01-01', -100_000_00), off(2, '2026-04-01', -105_000_00), off(3, '2026-07-15', -98_000_00)],
      plan,
      accounts,
    )
    expect(gap).not.toBeNull()
    expect(gap!.sinceDate).toBe('2026-01-01')
    expect(gap!.count).toBe(3)
    expect(gap!.meanDeltaCents).toBeCloseTo(-101_000_00, -3)
  })

  it('stays quiet while the gap is still moving', () => {
    expect(
      steadyGap(
        [off(1, '2026-01-01', -100_000_00), off(2, '2026-04-01', -50_000_00), off(3, '2026-07-15', -10_000_00)],
        plan,
        accounts,
      ),
    ).toBeNull()
  })

  it('needs half a year of check-ins, and enough of them', () => {
    expect(
      steadyGap([off(1, '2026-05-01', -100_000_00), off(2, '2026-06-01', -100_000_00), off(3, '2026-07-01', -100_000_00)], plan, accounts),
    ).toBeNull()
    expect(steadyGap([off(1, '2026-01-01', -100_000_00), off(2, '2026-07-15', -100_000_00)], plan, accounts)).toBeNull()
  })

  it('only looks at the recent run, so an old wobble does not block it', () => {
    const gap = steadyGap(
      [
        off(1, '2025-03-01', 200_000_00),
        off(2, '2026-01-01', -100_000_00),
        off(3, '2026-04-01', -100_000_00),
        off(4, '2026-07-15', -100_000_00),
      ],
      plan,
      accounts,
    )
    expect(gap?.sinceDate).toBe('2026-01-01')
  })

  it('needs a plan with a start date and a gap on one side', () => {
    const undated = makeScenario({ id: 2, planStartDate: null })
    expect(steadyGap([off(1, '2026-01-01', -1), off(2, '2026-04-01', -1), off(3, '2026-07-15', -1)], undated, accounts)).toBeNull()
    expect(
      steadyGap([off(1, '2026-01-01', -100_000_00), off(2, '2026-04-01', 100_000_00), off(3, '2026-07-15', -100_000_00)], plan, accounts),
    ).toBeNull()
  })
})
