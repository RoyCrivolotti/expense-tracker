import type { ScatterPoint } from '../../../charts/linearScale'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import type { MoneyFormat } from '../../../../engine/money'
import { checkinInvestedCents, nominalToReal, shortDateLabel, yearOffsetFromDate } from '../../../../engine'
import type { WealthAccount, WealthCheckin } from '../../../../types'
import { formatMoneyShort } from '../chartTheme'

/**
 * Check-ins as chart points, in the plan's money like its line: a balance exactly on plan
 * sits on it. Those before the plan starts or past the window are left out, and x is in
 * steps of the chart's axis.
 */
export function realCheckinPoints(
  checkins: WealthCheckin[],
  accounts: WealthAccount[],
  planStartDate: string,
  windowYears: number,
  stepYears: number,
  inflationRate: number,
): ScatterPoint[] {
  return checkins.flatMap((c) => {
    const offset = yearOffsetFromDate(planStartDate, c.checkinDate)
    if (offset === null || offset < 0 || offset > windowYears) return []
    const value = nominalToReal(checkinInvestedCents(c, accounts), planStartDate, c.checkinDate, inflationRate)
    return [{ xIndex: offset / stepYears, value, label: shortDateLabel(c.checkinDate) }]
  })
}

/**
 * The reading nearest a step. Within half a step it is the step's own; further away it
 * is still the nearest thing to say, named by its date so it does not pass for a reading
 * taken there. Null only when there are no readings at all.
 */
export function nearestScatter(points: ScatterPoint[], index: number): { value: number; on: string | null } | null {
  let best: ScatterPoint | null = null
  let bestDist = Infinity
  for (const p of points) {
    const d = Math.abs(p.xIndex - index)
    if (d < bestDist) {
      best = p
      bestDist = d
    }
  }
  if (!best) return null
  return { value: best.value, on: bestDist <= 0.5 ? null : (best.label ?? null) }
}

/** A tooltip label, with the reading's date when it is not the step's own. */
export function readingLabel(label: string, on: string | null): string {
  return on ? `${label}, ${on}` : label
}

export function nearestScatterValue(points: ScatterPoint[], index: number): number | null {
  let best: ScatterPoint | null = null
  let bestDist = Infinity
  for (const p of points) {
    const d = Math.abs(p.xIndex - index)
    if (d <= 0.5 && d < bestDist) {
      best = p
      bestDist = d
    }
  }
  return best?.value ?? null
}

export function buildCheckinTooltip(
  i: number,
  titles: string[],
  planValues: number[],
  scatterPoints: ScatterPoint[],
  format: MoneyFormat,
  planColor?: string,
  actualColor?: string,
): { title: string; lines: TooltipLine[] } {
  const lines: TooltipLine[] = [
    { label: 'Plan', value: formatMoneyShort(planValues[i] ?? 0, format), color: planColor },
  ]
  const actual = nearestScatter(scatterPoints, i)
  if (actual !== null) {
    lines.push({ label: readingLabel('Actual', actual.on), value: formatMoneyShort(actual.value, format), color: actualColor })
  }
  return { title: titles[i] ?? String(i), lines }
}
