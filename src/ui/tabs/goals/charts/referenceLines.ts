import type { Milestone } from '../../../../types'
import type { ChartRefCurve } from '../../../charts/LinearChart'

type RefCurve = ChartRefCurve

export interface ReferenceLines {
  /** Flat lines: a target that is in the same money as the chart. */
  lines: number[]
  /** A target in the other money, which moves with the inflation between one year and the next. */
  curves: RefCurve[]
  /** The FI target when it is too far above the plan to draw, so it can be marked on the chart's edge. */
  fiAbove: number | null
  /** The picked milestone's line, when it is drawn: a flat line's value, or a curve's id. */
  highlight: { line: number } | { curveId: string } | null
}

interface Input {
  milestones: Milestone[]
  fiTargetCents: number | null
  /** The highest value the chart draws; a target far above it is left off rather than stretching the axis. */
  drawnMax: number | undefined
  /** The chart's x axis, in years from the plan start. */
  years: number[]
  inflationRate: number
  nominalMode: boolean
  /** The milestone picked to stand out, by its amount on the account. */
  pickedCents?: number | null | undefined
}

/** How far above what is drawn a target may be and still be drawn. */
const CEILING_SHARE = 1.15

const curveOf = (id: string, years: number[], at: (year: number) => number): RefCurve => ({
  id,
  values: years.map((y) => Math.round(at(y))),
})

/**
 * The milestone and FI target lines. The two are in different money. A milestone is an amount you
 * want to see on the account, so in Nominal (euros on the account) it is a flat line, and in
 * Purchasing power (the euros of the plan start) it falls by the inflation as the years go by. The FI
 * target is a yearly spend in the plan's money, so it is flat in Purchasing power and rises with the
 * inflation in Nominal. Drawn the other way round, the plan would seem to cross a target years before
 * it does. A line far above the plan is left off, as a reference sets the axis.
 */
interface View {
  amounts: number[]
  ceiling: number
  years: number[]
  growth: (year: number) => number
  /** The FI target when it is drawn. */
  fi: number | null
  picked: number | null
}

type Drawn = Pick<ReferenceLines, 'lines' | 'curves' | 'highlight'>

/** Nominal: a milestone is level at its amount, and the FI target rises with the inflation. */
function nominalView({ amounts, ceiling, years, growth, fi, picked }: View): Drawn {
  const lines = amounts.filter((a) => a <= ceiling)
  const curves = fi !== null ? [curveOf('fi', years, (y) => fi * growth(y))] : []
  return { lines, curves, highlight: picked !== null && lines.includes(picked) ? { line: picked } : null }
}

/** Purchasing power: a milestone falls by the inflation, and the FI target is level. */
function realView({ amounts, ceiling, years, growth, fi, picked }: View): Drawn {
  // The curve is highest where it starts, and it is its low end that says whether the plan can reach it.
  const last = years[years.length - 1] ?? 0
  const reachable = amounts.filter((a) => a / growth(last) <= ceiling)
  const curves = reachable.map((a) => curveOf(`milestone-${a}`, years, (y) => a / growth(y)))
  const highlight = picked !== null && reachable.includes(picked) ? { curveId: `milestone-${picked}` } : null
  return { lines: fi !== null ? [fi] : [], curves, highlight }
}

export function referenceLines({ milestones, fiTargetCents, drawnMax, years, inflationRate, nominalMode, pickedCents = null }: Input): ReferenceLines {
  const ceiling = drawnMax != null && drawnMax > 0 ? drawnMax * CEILING_SHARE : Infinity
  const fiFits = fiTargetCents !== null && fiTargetCents <= ceiling
  const view: View = {
    amounts: milestones.map((m) => m.amountCents),
    ceiling,
    years,
    growth: (year) => Math.pow(1 + inflationRate, year),
    fi: fiFits ? fiTargetCents : null,
    picked: pickedCents,
  }
  return { ...(nominalMode ? nominalView(view) : realView(view)), fiAbove: fiTargetCents !== null && !fiFits ? fiTargetCents : null }
}
