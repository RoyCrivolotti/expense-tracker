import { memo, useDeferredValue, useMemo } from 'react'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMarketVolatility } from '../../../hooks/marketVolatilityContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { formatCentsCompact, currencyWord } from '../../../../engine'
import { LinearChart } from '../../../charts/LinearChart'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { planMoneyLabel } from '../planMoneyLabel'
import { Disclosure } from '../Disclosure'
import { ChartShell } from './ChartShell'
import { SpreadLegend, SpreadTable } from './SpreadParts'
import { spreadTooltip } from './spreadTooltip'
import { useReplayInputOrLive } from './useReplayInput'
import { useSpreadReplay } from './useSpreadReplay'
import { SPREAD_RUNS, fiRow, milestoneRows, spreadSeries } from './spreadModel'
import { spreadCaption, spreadHeadline, spreadWarning } from './spreadText'
import styles from '../goals.module.css'

export interface SpreadChartProps {
  draft: NewGoalScenario
  milestones: Milestone[]
  /** The Nominal view: the money of each year, as the main chart shows it. */
  nominal?: boolean
  /** How many runs; the card's own, a test's smaller one. */
  runs?: number
  height?: number
  embedded?: boolean
  /** The card is far from the screen: leave the replay as it is until it is near again. */
  paused?: boolean
}

function SpreadChartImpl({
  draft: liveDraft,
  milestones,
  nominal = false,
  runs = SPREAD_RUNS,
  height = 210,
  embedded = false,
  paused = false,
}: SpreadChartProps) {
  // The replay waits until the edits have stopped for a moment, and until the card is near the screen.
  // The inputs are painted first and the replay follows, so typing is not held up by it.
  const draft = useDeferredValue(useReplayInputOrLive(liveDraft, paused))
  const inflationRate = useAssumedInflation()
  const volatility = useMarketVolatility()
  const format = useMoneyFormat()
  const { plan, result, targetCents } = useSpreadReplay(draft, milestones, { inflationRate, volatility, runs })

  const money = (cents: number) => formatCentsCompact(cents, format)
  const short = (cents: number) => formatMoneyShort(cents, format)
  const moneyLabel = nominal
    ? `${currencyWord(format)} on your account in each year`
    : planMoneyLabel(draft.planStartDate, format)
  const series = useMemo(
    () => spreadSeries({ plan, result, inflationRate, nominal }),
    [plan, result, inflationRate, nominal],
  )
  const labels = useMemo(
    () =>
      sparseLabels(
        plan.map((p) => p.year),
        5,
      ),
    [plan],
  )
  const tooltip = (i: number) => spreadTooltip(i, { series, short, planStartDate: draft.planStartDate })

  const fi =
    targetCents === null
      ? null
      : fiRow({ result, planStartDate: draft.planStartDate, years: result.years, money, targetCents, format })
  const rows = [
    ...milestoneRows({ milestones, result, planStartDate: draft.planStartDate, years: result.years, money }),
    ...(fi ? [fi] : []),
  ]
  const warning = spreadWarning(result)
  const caption = spreadCaption({ runs: result.runs, volatility, realReturn: draft.expectedRealReturn, format })

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>How far luck could move the plan</h3>
      <p className={styles.chartHint}>
        {spreadHeadline({ result, plan, money: short, moneyLabel, nominal, inflationRate, runs: result.runs, format })}
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        formatValue={short}
        ariaLabel="The plan against a spread of random market years"
        tooltip={tooltip}
      />
      <SpreadLegend series={series} />
      {warning ? <p className={`${styles.chartHint} ${styles.chartCaption}`}>{warning}</p> : null}
      {rows.length > 0 ? <SpreadTable rows={rows} /> : null}
      <p className={`${styles.chartHint} ${styles.chartCaption}`}>{caption.lead}</p>
      <Disclosure title="How to read it">
        {caption.details.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </Disclosure>
    </ChartShell>
  )
}

export const SpreadChart = memo(SpreadChartImpl)
