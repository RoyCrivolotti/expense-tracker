import { describe, expect, it } from 'vitest'
import { steadyGap } from './steadyGap'
import { planValueAtDate, realToNominal } from './wealthTracking'
import { makeScenario, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'

const accounts = [makeWealthAccount({ id: 1, kind: 'investment' })]
const plan = makeScenario({ id: 1, isActive: true, planStartDate: '2025-01-01' })

/** A check-in sitting `gapCents` off the plan on that date, in the plan's money. */
function off(id: number, date: string, gapCents: number) {
  const projected = planValueAtDate(plan, date, DEFAULT_INFLATION_RATE)!
  return makeWealthCheckin({
    id,
    checkinDate: date,
    entries: [{ accountId: 1, valueCents: realToNominal(projected + gapCents, plan.planStartDate!, date, DEFAULT_INFLATION_RATE) }],
  })
}

describe('steadyGap', () => {
  it('reports a run of check-ins that all sit about the same distance behind', () => {
    const gap = steadyGap(
      [off(1, '2026-01-01', -100_000_00), off(2, '2026-04-01', -105_000_00), off(3, '2026-07-15', -98_000_00)],
      plan,
      accounts, DEFAULT_INFLATION_RATE,
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
        accounts, DEFAULT_INFLATION_RATE,
      ),
    ).toBeNull()
  })

  it('stays quiet while a gap widens, even when each reading is near the mean', () => {
    // 80k and 133k are each within a quarter of the 106.5k mean, so a rule on each
    // reading's distance from the mean would call this steady, yet the gap has grown by
    // two thirds: that is the saving, not the starting point. The middle reading sits
    // on the mean so the two ends are exactly the old rule's limit.
    expect(
      steadyGap(
        [off(1, '2026-01-01', -80_000_00), off(2, '2026-04-01', -106_500_00), off(3, '2026-07-15', -133_000_00)],
        plan,
        accounts, DEFAULT_INFLATION_RATE,
      ),
    ).toBeNull()
  })

  it('ignores a gap too small to be worth a re-baseline', () => {
    // About a thousand behind on a plan investing 1,500 a month is on-plan noise; three
    // months of contributions is where it starts to be a starting-point problem.
    const monthly = makeScenario({ id: 3, isActive: true, planStartDate: '2025-01-01', monthlyContributionCents: 1_500_00 })
    const near = (id: number, date: string, gap: number) =>
      makeWealthCheckin({
        id,
        checkinDate: date,
        entries: [{ accountId: 1, valueCents: realToNominal(planValueAtDate(monthly, date, DEFAULT_INFLATION_RATE)! + gap, '2025-01-01', date, DEFAULT_INFLATION_RATE) }],
      })
    expect(
      steadyGap([near(1, '2026-01-01', -900_00), near(2, '2026-04-01', -1_000_00), near(3, '2026-07-15', -1_100_00)], monthly, accounts, DEFAULT_INFLATION_RATE),
    ).toBeNull()
    expect(
      steadyGap([near(1, '2026-01-01', -4_400_00), near(2, '2026-04-01', -4_600_00), near(3, '2026-07-15', -4_500_00)], monthly, accounts, DEFAULT_INFLATION_RATE),
    ).not.toBeNull()
  })

  it('needs half a year of check-ins, and enough of them', () => {
    expect(
      steadyGap([off(1, '2026-05-01', -100_000_00), off(2, '2026-06-01', -100_000_00), off(3, '2026-07-01', -100_000_00)], plan, accounts, DEFAULT_INFLATION_RATE),
    ).toBeNull()
    expect(steadyGap([off(1, '2026-01-01', -100_000_00), off(2, '2026-07-15', -100_000_00)], plan, accounts, DEFAULT_INFLATION_RATE)).toBeNull()
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
      accounts, DEFAULT_INFLATION_RATE,
    )
    expect(gap?.sinceDate).toBe('2026-01-01')
  })

  it('needs a plan with a start date and a gap on one side', () => {
    const undated = makeScenario({ id: 2, planStartDate: null })
    expect(steadyGap([off(1, '2026-01-01', -1), off(2, '2026-04-01', -1), off(3, '2026-07-15', -1)], undated, accounts, DEFAULT_INFLATION_RATE)).toBeNull()
    expect(
      steadyGap([off(1, '2026-01-01', -100_000_00), off(2, '2026-04-01', 100_000_00), off(3, '2026-07-15', -100_000_00)], plan, accounts, DEFAULT_INFLATION_RATE),
    ).toBeNull()
  })
})
