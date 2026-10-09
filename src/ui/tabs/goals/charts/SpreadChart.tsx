import { memo, useDeferredValue, useMemo } from 'react'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMarketVolatility } from '../../../hooks/marketVolatilityContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import {
  fireNumber,
  formatCentsCompact,
  projectNetWorth,
  replayMarket,
  scenarioToParams,
} from '../../../../engine'
import { ChartLegend } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { LinearChart } from '../../../charts/LinearChart'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { planMoneyLabel } from '../planMoneyLabel'
import { yearLabel } from '../yearLabel'
import { ChartShell } from './ChartShell'
import { ScrollRegion } from './ScrollRegion'
import { useReplayInputOrLive } from './useReplayInput'
import {
  SPREAD_RUNS,
  fiRow,
  milestoneRows,
  spreadCaption,
  spreadHeadline,
  spreadKey,
  spreadSeries,
  spreadWarning,
} from './spreadModel'
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

function SpreadChartImpl({ draft: liveDraft, milestones, nominal = false, runs = SPREAD_RUNS, height = 210, embedded = false, paused = false }: SpreadChartProps) {
  // The replay waits until the edits have stopped for a moment, and until the card is near the screen.
  // The inputs are painted first and the replay follows, so typing is not held up by it.
  const draft = useDeferredValue(useReplayInputOrLive(liveDraft, paused))
  const inflationRate = useAssumedInflation()
  const volatility = useMarketVolatility()
  const format = useMoneyFormat()
  // The replay is the costly part, so it runs when something it reads changes, not when the draft's name does.
  const key = `${spreadKey(draft, inflationRate, volatility, runs)}|${milestones.map((m) => m.amountCents).join(',')}`
  const { plan, result, targetCents } = useMemo(() => {
    const p = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const target = draft.annualSpendCents > 0 && draft.safeWithdrawalRate > 0 ? fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate) : null
    return {
      plan: projectNetWorth(p),
      targetCents: target,
      result: replayMarket({ params: p, volatility, runs, milestonesCents: milestones.map((m) => m.amountCents), fiTargetCents: target }),
    }
    // The key is what the replay reads of the draft, the milestones and the settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const money = (cents: number) => formatCentsCompact(cents, format)
  const short = (cents: number) => formatMoneyShort(cents, format)
  const moneyLabel = nominal ? 'euros on your account in each year' : planMoneyLabel(draft.planStartDate)
  const series = useMemo(
    () => spreadSeries({ plan, result, inflationRate, nominal }),
    [plan, result, inflationRate, nominal],
  )
  const labels = useMemo(() => sparseLabels(plan.map((p) => p.year), 5), [plan])
  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const line = (label: string, id: string): TooltipLine => ({
      label,
      value: short(series.find((s) => s.id === id)?.values[i] ?? 0),
      color: series.find((s) => s.id === id)?.color,
      tone: 'neutral',
    })
    return {
      title: `Year ${i} (${yearLabel(i, draft.planStartDate)})`,
      lines: [
        line('Luckiest tenth above', 'p90'),
        line('Middle run', 'median'),
        line('The plan', 'plan'),
        line('Unluckiest tenth below', 'p10'),
      ],
    }
  }

  const fi = targetCents === null ? null : fiRow({ result, planStartDate: draft.planStartDate, years: result.years, money, targetCents })
  const rows = [...milestoneRows({ milestones, result, planStartDate: draft.planStartDate, years: result.years, money }), ...(fi ? [fi] : [])]
  const warning = spreadWarning(result)

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
      <ChartLegend
        items={[
          { label: 'The plan', color: series.find((s) => s.id === 'plan')!.color },
          { label: 'Middle run, middle half shaded, 8 in 10 between the dashed lines', color: series.find((s) => s.id === 'median')!.color },
        ]}
      />
      {warning ? <p className={`${styles.chartHint} ${styles.chartCaption}`}>{warning}</p> : null}
      {rows.length > 0 ? (
        <ScrollRegion label="When the runs first reach each amount, scrolls sideways when the text is large">
          <table className={styles.spreadTable}>
            <caption className={styles.spreadTableCaption}>When the runs first reach each amount</caption>
            <thead>
              <tr>
                <th scope="col">Amount</th>
                <th scope="col">Half of the runs</th>
                <th scope="col">8 in 10</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">
                    {row.label}
                    <span className={styles.spreadTableNote}>{row.gets} runs get there</span>
                  </th>
                  <td>{row.middle}</td>
                  <td>{row.wide}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      ) : null}
      <p className={`${styles.chartHint} ${styles.chartCaption}`}>
        {spreadCaption({
          runs: result.runs,
          volatility,
          realReturn: draft.expectedRealReturn,
          format,
          chartMoney: moneyLabel,
          tableMoney: rows.length > 0 ? planMoneyLabel(draft.planStartDate) : null,
        })}
      </p>
    </ChartShell>
  )
}

export const SpreadChart = memo(SpreadChartImpl)
