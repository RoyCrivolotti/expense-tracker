import type { ScenarioLegendItem } from '../ScenarioSeriesLegend'

/**
 * What a screen reader is told when the year pointed at changes: the year and each line's value
 * in it, and that it is a purchase year. Lines hidden from the chart, and lines that stop before
 * the year, are left out rather than read as nothing.
 */
export function readoutSentence(
  year: number | null,
  items: ScenarioLegendItem[],
  purchaseYear: boolean,
  formatValue: (cents: number) => string,
): string {
  if (year === null) return ''
  const values = items
    .filter((item) => !item.hidden && item.valueCents !== null)
    .map((item) => `${item.label} ${formatValue(item.valueCents as number)}.`)
  return [`Year ${year}.`, ...values, ...(purchaseYear ? ['A purchase year.'] : [])].join(' ')
}
