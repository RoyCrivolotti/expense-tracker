/**
 * How a copy started later compares with the scenario it was made from, as the chart and the table will show
 * them: on the calendar every scenario shares, in the euros of its origin, through the one reader every screen
 * uses (`valueOnAxisAt`), and at the year the table rests on. The "Start a copy later…" sheet sums it up in a
 * line, so that what the copy's rules add up to is said before it is made rather than found on the chart, and
 * the gap it quotes is the one the table shows a click later.
 */
import type { GoalScenario } from '../types'
import type { NewGoalScenario } from '../data/dataSource'
import { dateAtYears, yearsBetween } from './dates'
import { projectNetWorth } from './projection'
import { valueOnAxisAt } from './scenarioAxis'
import { scenarioToParams } from './scenarioProjection'

type Projectable = GoalScenario | NewGoalScenario

export interface CopyOutcome {
  /** The first and last month the copy's net worth reads above its source's ("2031-05"); null when it never does. */
  netWorthAbove: { from: string; until: string } | null
  /** The day both are read on: `at.year` years after the origin. */
  endDate: string
  /** The origin, whose euros every figure here is in. */
  origin: string
  /** Copy less source on `endDate`, in cents of the origin's euros; null when either has no figure there. */
  investedGapCents: number | null
  netWorthGapCents: number | null
  /** The source's invested on `endDate`, for saying a gap as a share of it; null when it has none there. */
  sourceInvestedCents: number | null
}

/** Read monthly: what a person reads off the chart, and fine enough to place a crossing in its month. */
const STEPS_PER_YEAR = 12

/** Above by less than this is the same figure, rounded: a cent either way is not "higher". */
const ABOVE_BY_CENTS = 100

/**
 * The copy against its source on the calendar that starts on `at.origin`, month by month over the years both
 * run, and on the axis year `at.year`, where the table reads every row. Null when either has no start, or the
 * copy starts before its source or the origin.
 */
export function copyOutcome(
  source: Projectable,
  copy: Projectable,
  inflationRate: number,
  at: { origin: string; year: number },
): CopyOutcome | null {
  const sourceStart = source.planStartDate
  const start = copy.planStartDate
  if (!sourceStart || !start || start < sourceStart || sourceStart < at.origin) return null
  const theirsAt = yearsBetween(at.origin, sourceStart)
  const oursAt = yearsBetween(at.origin, start)
  const end = Math.min(theirsAt + source.horizonYears, oursAt + copy.horizonYears)
  const theirs = projectNetWorth(scenarioToParams(source, inflationRate))
  const ours = projectNetWorth(scenarioToParams(copy, inflationRate))
  const read = (
    points: typeof theirs,
    offset: number,
    t: number,
    field: 'invested' | 'netWorth',
  ) => valueOnAxisAt(points, offset, inflationRate, t, field)
  const above: number[] = []
  for (let k = 0; oursAt + k / STEPS_PER_YEAR <= end; k += 1) {
    const t = oursAt + k / STEPS_PER_YEAR
    if ((read(ours, oursAt, t, 'netWorth') ?? 0) - (read(theirs, theirsAt, t, 'netWorth') ?? 0) > ABOVE_BY_CENTS)
      above.push(t)
  }
  const month = (t: number) => dateAtYears(at.origin, t).slice(0, 7)
  const gap = (field: 'invested' | 'netWorth') => {
    const a = read(ours, oursAt, at.year, field)
    const b = read(theirs, theirsAt, at.year, field)
    return a === null || b === null ? null : a - b
  }
  return {
    netWorthAbove: above.length === 0 ? null : { from: month(above[0]!), until: month(above[above.length - 1]!) },
    endDate: dateAtYears(at.origin, at.year),
    origin: at.origin,
    investedGapCents: gap('invested'),
    netWorthGapCents: gap('netWorth'),
    sourceInvestedCents: read(theirs, theirsAt, at.year, 'invested'),
  }
}
