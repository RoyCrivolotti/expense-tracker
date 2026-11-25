import type { TooltipLine } from '../../../charts/ChartTooltip'
import type { ChartSeries } from '../../../charts/LinearChart'
import { yearLabel } from '../yearLabel'

/** The tooltip at year `i`: the four lines the chart draws, from the luckiest tenth down. */
export function spreadTooltip(
  i: number,
  {
    series,
    short,
    planStartDate,
  }: { series: ChartSeries[]; short: (cents: number) => string; planStartDate: string | null },
): { title: string; lines: TooltipLine[] } {
  const line = (
    label: string,
    id: string,
  ): TooltipLine => ({
    label,
    value: short(series.find((s) => s.id === id)?.values[i] ?? 0),
    color: series.find((s) => s.id === id)?.color,
    tone: 'neutral',
  })
  return {
    title: `Year ${i} (${yearLabel(i, planStartDate)})`,
    lines: [
      line('Luckiest tenth above', 'p90'),
      line('Middle run', 'median'),
      line('The plan', 'plan'),
      line('Unluckiest tenth below', 'p10'),
    ],
  }
}
