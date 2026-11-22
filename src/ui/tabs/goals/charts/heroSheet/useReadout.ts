import { useMemo } from 'react'
import { useMoneyFormat } from '../../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../../chartTheme'
import { useChartLegendState, withFromToday } from '../heroLegendState'
import { yearLabel } from '../../yearLabel'
import { readoutSentence } from './heroReadout'
import type { HeroSheetModel } from './heroSheetModel'

/** What the readout shows for the year pointed at: every line's value, and what a purchase did in it. */
export function useReadout(
  model: HeroSheetModel,
  active: number | null,
) {
  const format = useMoneyFormat()
  const { legend } = model
  const { activeYear, readYear, legendItems, breakdowns, yearZeroHint } = useChartLegendState(
    legend,
    active,
    legend.restIndex,
  )
  const items = useMemo(
    () => withFromToday(legendItems, legend.fromTodayLine, legend.fromTodayLabel, readYear),
    [legendItems, legend.fromTodayLine, legend.fromTodayLabel, readYear],
  )
  const origin = legend.calendarOrigin
  const sentence = readoutSentence(
    activeYear !== null && origin ? yearLabel(activeYear, origin) : activeYear,
    items,
    breakdowns.length > 0,
    (cents) => formatMoneyShort(cents, format),
  )
  return {
    items,
    activeYear,
    breakdowns,
    yearZeroHint,
    sentence,
    calendarOrigin: legend.calendarOrigin,
    restNote: legend.restNote,
    nominalMode: legend.nominalMode,
    onToggle: legend.onToggleVisible,
  }
}

export type Readout = ReturnType<typeof useReadout>
