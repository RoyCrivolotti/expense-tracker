/**
 * How far a balance sits from the plan, as a stretch of time: the months between the date asked
 * about and the point on the plan's line that has this balance. It is the horizontal gap on the
 * chart, so it follows the plan's own pace, return included, and does not jump where the plan
 * changes how much it invests. A gap in money divided by the monthly amount does both.
 *
 * The line is the one the chart draws, straight segments between the year points. It is not
 * always rising (a house purchase takes money out), so the point is the nearest one in the
 * direction of the gap: ahead looks for the first time the line gets to the balance, behind for
 * the last time it was at it.
 */

export interface PlanDistance {
  /** Positive when the balance is ahead of the plan, negative when behind. */
  months: number
  /** Where on the plan's axis, in years from its start, the line has the balance. */
  atOffset: number
}

/**
 * Null when there is no such point: before the plan starts or past its last year there is no
 * line to measure against, and a balance the line never reaches (above its end, or below its
 * start) is further away than the plan can say.
 */
export function planDistance(
  points: readonly { year: number; investedCents: number }[],
  offset: number,
  balanceCents: number,
): PlanDistance | null {
  const values = points.map((p) => p.investedCents)
  const last = values.length - 1
  if (last < 1 || offset < 0 || offset >= last) return null

  const at = (t: number): number => {
    const i = Math.floor(t)
    return i >= last ? values[last]! : values[i]! + (t - i) * (values[i + 1]! - values[i]!)
  }
  const here = at(offset)
  const found = (t: number): PlanDistance => ({ months: (t - offset) * 12, atOffset: t })

  if (balanceCents === here) return found(offset)

  if (balanceCents > here) {
    for (let i = Math.floor(offset); i < last; i++) {
      const from = Math.max(i, offset)
      const start = at(from)
      const end = values[i + 1]!
      if (end >= balanceCents) return found(from + ((balanceCents - start) / (end - start)) * (i + 1 - from))
    }
    return null
  }

  for (let i = Math.floor(offset); i >= 0; i--) {
    const to = Math.min(i + 1, offset)
    const start = values[i]!
    if (start <= balanceCents) return found(i + ((balanceCents - start) / (at(to) - start)) * (to - i))
  }
  return null
}
