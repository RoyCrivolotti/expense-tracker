import type { OverviewKpis } from '../../../engine'
import { chartAxis } from '../../charts/chartLayout'

export interface TrendPoint {
  month: string
  spendCents: number
  /** The hatched cap: committed but not yet paid; never more than the spend itself. */
  unpaidCents: number
  incomeCents: number
}

export interface TrendModel {
  points: TrendPoint[]
  avgSpendCents: number
  maxVal: number
  ticks: number[]
}

/** Shape the KPI series into the trend chart's points and axis. */
export function buildTrendModel(
  series: OverviewKpis['series'],
  unpaidByMonth: Map<string, number>,
): TrendModel {
  const points = series.map((s) => {
    const spendCents = Math.max(0, s.totals.spendCents)
    const unpaid = unpaidByMonth.get(s.month) ?? 0
    return {
      month: s.month,
      spendCents,
      unpaidCents: Math.max(0, Math.min(unpaid, spendCents)),
      incomeCents: Math.max(0, s.totals.incomeCents),
    }
  })
  const avgSpendCents =
    points.length === 0
      ? 0
      : Math.round(points.reduce((sum, p) => sum + p.spendCents, 0) / points.length)
  const { max, ticks } = chartAxis(points.flatMap((p) => [p.incomeCents, p.spendCents]))
  return { points, avgSpendCents, maxVal: max, ticks }
}
