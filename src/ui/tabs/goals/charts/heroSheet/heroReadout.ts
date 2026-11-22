import { withEnded } from '../../../../charts/withEnded'
import type { ScenarioLegendItem } from '../ScenarioSeriesLegend'

/**
 * What a screen reader is told when the year pointed at changes: the year and each line's value
 * in it, and that it is a purchase year. A line that has ended is read with its last figure and the
 * year it ended in. Lines hidden from the chart, and lines that have no figure to give, are left out
 * rather than read as nothing.
 */
export function readoutSentence(
  /** The year pointed at: a year of the plan, or its name on a calendar ("2034"). */
  year: number | string | null,
  items: ScenarioLegendItem[],
  purchaseYear: boolean,
  formatValue: (cents: number) => string,
): string {
  if (year === null) return ''
  const values = items
    .filter((item) => !item.hidden && item.valueCents !== null)
    .map((item) => `${item.label} ${withEnded(formatValue(item.valueCents as number), item.endedIn)}.`)
  return [
    typeof year === 'number' ? `Year ${year}.` : `${year}.`,
    ...values,
    ...(purchaseYear ? ['A purchase year.'] : []),
  ].join(' ')
}
