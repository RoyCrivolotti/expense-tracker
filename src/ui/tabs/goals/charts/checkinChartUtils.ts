import type { ScatterPoint } from '../../../charts/linearScale'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import type { MoneyFormat } from '../../../../engine/money'
import { formatMoneyShort } from '../chartTheme'

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
  years: number[],
  planValues: number[],
  scatterPoints: ScatterPoint[],
  format: MoneyFormat,
  planColor?: string,
  actualColor?: string,
): { title: string; lines: TooltipLine[] } {
  const year = years[i] ?? i
  const lines: TooltipLine[] = [
    { label: 'Plan', value: formatMoneyShort(planValues[i] ?? 0, format), color: planColor },
  ]
  const actual = nearestScatterValue(scatterPoints, i)
  if (actual !== null) {
    lines.push({ label: 'Actual', value: formatMoneyShort(actual, format), color: actualColor })
  }
  return { title: `Year ${year}`, lines }
}
