import type { ChartSeries } from '../../../charts/LinearChart'
import type { StartMark } from '../../../charts/ChartStartMarks'
import type { ScenarioLine } from './heroLegendState'

/** Where each line buys a house, on the axis. */
export function purchaseMarkerIndices(
  lines: ScenarioLine[],
  years: number[],
): { yearIndex: number }[] {
  const indices = new Set<number>()
  for (const line of lines) {
    const purchaseYear = line.params.housePurchaseYear
    if (purchaseYear == null) continue
    const place = line.offsetYears + purchaseYear
    if (line.offsetYears === 0) {
      const idx = years.indexOf(purchaseYear)
      if (idx >= 0) indices.add(idx)
    } else if (place <= (years[years.length - 1] ?? 0)) {
      indices.add(place)
    }
  }
  return [...indices].sort((a, b) => a - b).map((yearIndex) => ({ yearIndex }))
}

/** Where each line that starts after the axis' origin begins, as drawn: its first point, and when. */
export function startMarksOf(
  lines: ScenarioLine[],
  drawn: ChartSeries[],
): StartMark[] {
  return drawn.flatMap((s, i) => {
    const line = lines[i]
    const index = s.xs?.[0]
    const value = s.values[0]
    if (!line?.startsIn || index === undefined || value === undefined) return []
    return [{ index, value, color: s.color, label: `starts ${line.startsIn}` }]
  })
}
