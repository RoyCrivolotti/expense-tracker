import { useCallback } from 'react'
import type { ChartSeries } from '../../../charts/LinearChart'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../chartTheme'
import { pointSeriesValueAt } from './checkinChartUtils'
import { withEnded } from '../../../charts/withEnded'
import { axisYearName, endedReading, rowStatus, type LegendInput } from './heroLegendState'

/**
 * The hero chart's tooltip: each line's figure at the year pointed at, read where the legend reads it.
 * A scenario that has not started there says when it does, and on a calendar one that has ended gives
 * its last figure and the year it ended in; where every scenario starts on one day a line past its horizon has no row, as it never had.
 */
export function useHeroTooltip(input: LegendInput, fromTodayLine: ChartSeries | null, fromTodayLabel: string) {
  const format = useMoneyFormat()
  return useCallback(
    (i: number): { title: string; lines: TooltipLine[] } => {
      const year = input.years[i] ?? i
      const tooltipLines: TooltipLine[] = input.readings.flatMap((s, idx) => {
        const value = s.values[i]
        const ended = value === undefined ? endedReading(input.lines[idx], s, year) : null
        const status = value === undefined && !ended ? rowStatus(input.lines[idx], year) : null
        if (value === undefined && !ended && status === null) return []
        const text = ended ? withEnded(formatMoneyShort(ended.valueCents, format), ended.endedIn) : value !== undefined ? formatMoneyShort(value, format) : (status ?? '')
        return [{ label: input.names[idx] ?? s.id, value: text, color: s.color, tone: 'neutral' as const }]
      })
      const fromTodayValue = fromTodayLine ? pointSeriesValueAt(fromTodayLine.points ?? [], year) : null
      if (fromTodayValue !== null) {
        tooltipLines.push({ label: fromTodayLabel, value: formatMoneyShort(fromTodayValue, format), color: fromTodayLine?.color, tone: 'neutral' })
      }
      return { title: axisYearName(year, input.calendarOrigin), lines: tooltipLines }
    },
    [input, format, fromTodayLine, fromTodayLabel],
  )
}
