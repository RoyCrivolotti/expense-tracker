import { currencyWord, scenarioAxis, type MoneyFormat } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { monthYear } from './charts/heroAxisText'
import { planMoneyLabel } from './planMoneyLabel'
import styles from './goals.module.css'

/**
 * The two moneys' names: by year ("2026 euros"), or by month where both starts are in one year and the
 * year alone would name two different moneys alike.
 */
function moneyNames(
  chartStart: string,
  draftStart: string,
  format: MoneyFormat,
): { chart: string; own: string; when: string } {
  if (chartStart.slice(0, 4) !== draftStart.slice(0, 4)) {
    return { chart: planMoneyLabel(chartStart, format), own: planMoneyLabel(draftStart, format), when: 'the year' }
  }
  const word = currencyWord(format)
  return { chart: `${word} of ${monthYear(chartStart)}`, own: `${word} of ${monthYear(draftStart)}`, when: 'the month' }
}

/**
 * Where the scenario being edited starts after the chart's axis does, the chart and the figures under
 * it are in two moneys: the chart in the euros of the earliest start, so every line can be read on one
 * scale, and the strip and the narrative in the scenario's own, as its editor is. One sentence says so,
 * since the same scenario's figure differs between the two by the inflation in between.
 */
export function TwoMoneys({
  chartStart,
  draftStart,
}: {
  chartStart: string | null
  draftStart: string | null | undefined
}) {
  const format = useMoneyFormat()
  if (!chartStart || !draftStart || (scenarioAxis([chartStart, draftStart]).offsets[1] ?? 0) <= 0) return null
  const { chart, own, when } = moneyNames(chartStart, draftStart, format)
  return (
    <p className={styles.twoMoneys}>
      The chart is in {chart} so the scenarios can be compared. The figures below are in {own}, {when} this scenario
      starts.
    </p>
  )
}
