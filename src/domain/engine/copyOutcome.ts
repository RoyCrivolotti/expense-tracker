/**
 * How a copy started later compares with the scenario it was made from, over the years both run, as the
 * chart and the table will show them: on one calendar, in the euros of the source's start, through the
 * one reader every screen uses (`valueOnAxisAt`). The "Start a copy later…" sheet sums it up in a line,
 * so that what the copy's rules add up to is said before it is made rather than found on the chart.
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
  /** The last date both run to, where the end figures are read. */
  endDate: string
  /** Copy less source at the end, in cents of the source's euros: invested, and net worth. */
  investedGapCents: number
  netWorthGapCents: number
  /** The source's own figures at the end, for saying a gap as a share of them. */
  sourceInvestedCents: number
  sourceNetWorthCents: number
}

/** Read monthly: what a person reads off the chart, and fine enough to place a crossing in its month. */
const STEPS_PER_YEAR = 12

/** Above by less than this is the same figure, rounded: a cent either way is not "higher". */
const ABOVE_BY_CENTS = 100

/**
 * The copy against its source from the copy's start to the end of whichever stops first. Null when either
 * has no start, or the copy does not start on or after its source.
 */
export function copyOutcome(source: Projectable, copy: Projectable, inflationRate: number): CopyOutcome | null {
  const origin = source.planStartDate
  const start = copy.planStartDate
  if (!origin || !start || start < origin) return null
  const offset = yearsBetween(origin, start)
  const end = Math.min(source.horizonYears, offset + copy.horizonYears)
  const theirs = projectNetWorth(scenarioToParams(source, inflationRate))
  const ours = projectNetWorth(scenarioToParams(copy, inflationRate))
  const read = (points: typeof theirs, at: number, t: number, field: 'invested' | 'netWorth') => valueOnAxisAt(points, at, inflationRate, t, field) ?? 0
  const above: number[] = []
  for (let k = 0; offset + k / STEPS_PER_YEAR <= end; k += 1) {
    const t = offset + k / STEPS_PER_YEAR
    if (read(ours, offset, t, 'netWorth') - read(theirs, 0, t, 'netWorth') > ABOVE_BY_CENTS) above.push(t)
  }
  const month = (t: number) => dateAtYears(origin, t).slice(0, 7)
  const sourceInvestedCents = read(theirs, 0, end, 'invested')
  const sourceNetWorthCents = read(theirs, 0, end, 'netWorth')
  return {
    netWorthAbove: above.length === 0 ? null : { from: month(above[0]!), until: month(above[above.length - 1]!) },
    endDate: dateAtYears(origin, end),
    investedGapCents: read(ours, offset, end, 'invested') - sourceInvestedCents,
    netWorthGapCents: read(ours, offset, end, 'netWorth') - sourceNetWorthCents,
    sourceInvestedCents,
    sourceNetWorthCents,
  }
}
