import type { GoalScenario } from '../../../../types'
import { scenarioAxis } from '../../../../engine'
import { yearLabel } from '../yearLabel'
import type { ScenarioLine } from './heroLegendState'

/** The year the chart's figures are read at while nothing is pointed at, on a calendar axis. */
export interface RestYear {
  index: number
  /** Every line drawn has a figure in it. Otherwise it is only the last year the window shows. */
  everyReaches: boolean
}

/** A float this close to a whole year is that year: starts part-way through one add scraps to it. */
const SCRAP = 1e-9

/** Where every scenario starts and ends on the axis, in the same order. */
export interface AxisSpans {
  starts: number[]
  ends: number[]
}

/**
 * Where every scenario starts and ends on the axis: each line drawn, and each saved scenario that is
 * not one (hidden, or the loaded one the draft stands for). The comparison table has no hidden rows
 * and rests on the last year all of them reach, so counting only the lines drawn would let hiding one
 * move the chart's year off the table's.
 */
export function axisSpans(lines: readonly ScenarioLine[], scenarios: readonly GoalScenario[], origin: string | null): AxisSpans {
  const drawn = new Set(lines.map((line) => line.scenarioId))
  const undrawn = scenarios
    .filter((s) => !drawn.has(s.id))
    .map((s) => ({ start: scenarioAxis([origin, s.planStartDate]).offsets[1] ?? 0, horizon: s.horizonYears }))
  return {
    starts: [...lines.map((line) => line.offsetYears), ...undrawn.map((u) => u.start)],
    ends: [...lines.map((line) => line.offsetYears + line.params.horizonYears), ...undrawn.map((u) => u.start + u.horizon)],
  }
}

/**
 * Scenarios that start or end on different days have no single last year, and figures read at the
 * last year drawn would leave the shorter ones blank. So the chips and rows read the last year every
 * scenario reaches (from `axisSpans`); where there is none (one starts after another has ended), or
 * a window ends before every line drawn has started, they read the last year drawn.
 */
export function restYear({ starts, ends }: AxisSpans, lastIndex: number): RestYear {
  const common = Math.floor(Math.min(...ends) + SCRAP)
  const latestStart = Math.ceil(Math.max(0, ...starts) - SCRAP)
  const reached = Math.min(common, lastIndex)
  return latestStart <= reached ? { index: reached, everyReaches: true } : { index: lastIndex, everyReaches: false }
}

/** "2056, the last year every scenario reaches", or "2036, the last year shown". */
function restWords(rest: RestYear, origin: string): string {
  return `${yearLabel(rest.index, origin)}, ${rest.everyReaches ? 'the last year every scenario reaches' : 'the last year shown'}`
}

/** The line under a wide chart whose chips are above it. */
export function chipsAboveHint(rest: RestYear, origin: string): string {
  return `The values in the chips above are for ${restWords(rest, origin)}, or for the year you point at.`
}

/** Said after a legend's own hint, on a phone and full screen, where the rows show figures before a year is pointed at. */
export function restNote(rest: RestYear, origin: string): string {
  return `The values are for ${restWords(rest, origin)}.`
}
