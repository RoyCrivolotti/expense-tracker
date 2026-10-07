import { useMemo } from 'react'
import { useMoneyFormat } from '../../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../../chartTheme'
import { useChartLegendState, withFromToday } from '../heroLegendState'
import { readoutSentence } from './heroReadout'
import type { HeroSheetModel } from './heroSheetModel'

/** What the readout shows for the year pointed at: every line's value, and what a purchase did in it. */
export function useReadout(model: HeroSheetModel, active: number | null) {
  const format = useMoneyFormat()
  const { legend } = model
  const { activeYear, legendItems, breakdowns, yearZeroHint } = useChartLegendState(
    legend.lines,
    legend.displaySeries,
    legend.names,
    legend.years,
    active,
    legend.scenarios,
    legend.hiddenIds,
  )
  const items = useMemo(
    () => withFromToday(legendItems, legend.fromTodayLine, legend.fromTodayLabel, activeYear),
    [legendItems, legend.fromTodayLine, legend.fromTodayLabel, activeYear],
  )
  const sentence = readoutSentence(activeYear, items, breakdowns.length > 0, (cents) => formatMoneyShort(cents, format))
  return {
    items,
    activeYear,
    breakdowns,
    yearZeroHint,
    sentence,
    nominalMode: legend.nominalMode,
    onToggle: legend.onToggleVisible,
  }
}

export type Readout = ReturnType<typeof useReadout>
