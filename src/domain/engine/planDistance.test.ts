import { describe, expect, it } from 'vitest'
import { planDistance } from './planDistance'

const line = (values: number[]) => values.map((investedCents, year) => ({ year, investedCents }))

describe('planDistance', () => {
  // A line that climbs faster in its second year: 100 a year, then 200, then 100.
  const climbing = line([100, 200, 400, 500])

  it('is the months until the plan gets to a balance that is ahead of it', () => {
    // At 1.5 the line is at 300. It reaches 450 half way through the third year, a year on.
    expect(planDistance(climbing, 1.5, 450)).toEqual({ months: 12, atOffset: 2.5 })
  })

  it('is the months since the plan was at a balance that is behind it', () => {
    // 250 is where the line was a quarter of the way through the second year.
    expect(planDistance(climbing, 1.5, 250)).toEqual({ months: -3, atOffset: 1.25 })
  })

  it('is nothing on the line', () => {
    expect(planDistance(climbing, 1.5, 300)).toEqual({ months: 0, atOffset: 1.5 })
  })

  it('reads a check-in that falls exactly on a year point', () => {
    expect(planDistance(climbing, 2, 450)?.months).toBeCloseTo(6)
    expect(planDistance(climbing, 2, 300)?.months).toBeCloseTo(-6)
  })

  it('has nothing to say about a balance the line never has', () => {
    expect(planDistance(climbing, 1.5, 600)).toBeNull()
    expect(planDistance(climbing, 1.5, 50)).toBeNull()
  })

  it('has no line before the plan starts or past its last year', () => {
    expect(planDistance(climbing, -0.1, 150)).toBeNull()
    expect(planDistance(climbing, 3, 450)).toBeNull()
    expect(planDistance(line([100]), 0, 100)).toBeNull()
  })

  it('goes to the nearest point in the direction of the gap when the line dips, as it does for a house purchase', () => {
    const dipping = line([100, 300, 100, 200, 300])
    // Behind: 150 was last reached on the way back up in the third year, not on the way down in the second.
    expect(planDistance(dipping, 3.5, 150)).toEqual({ months: -12, atOffset: 2.5 })
    // Ahead: the line has to get back up to 250, which it does in the fourth year, not before the dip.
    expect(planDistance(dipping, 1.5, 250)).toEqual({ months: 24, atOffset: 3.5 })
  })

  it('looks past a stretch where the plan does not move, such as a pause with no return', () => {
    const paused = line([100, 200, 200, 200, 300])
    expect(planDistance(paused, 1.5, 250)).toEqual({ months: 24, atOffset: 3.5 })
    expect(planDistance(paused, 1.5, 150)).toEqual({ months: -12, atOffset: 0.5 })
  })

  it('moves smoothly where the plan changes pace, with the same gap in money', () => {
    // 50 behind all the way along: six months where the line climbs 100 a year, three where it climbs 200.
    let previous: number | null = null
    for (let t = 0.5; t <= 2.9; t += 0.01) {
      const here = 100 + 100 * Math.min(t, 1) + 200 * Math.max(0, Math.min(t, 2) - 1) + 100 * Math.max(0, t - 2)
      const months = planDistance(climbing, t, here - 50)?.months
      expect(months).toBeDefined()
      if (previous !== null) expect(Math.abs(months! - previous)).toBeLessThan(0.2)
      previous = months!
    }
  })
})
