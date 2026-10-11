import { memo, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  FI_TARGET_RATES,
  fireNumber,
  projectDrawdown,
  projectNetWorth,
  replayRetirement,
  scenarioToParams,
  yearsToFi,
} from '../../../../engine'
import { ChartShell } from './ChartShell'
import { fiTargetsLine } from './fiTargetsLine'
import { useReplayInput } from './useReplayInput'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { aboutOnAccount, bothMoneys } from '../bothMoneys'
import { useMarketVolatility } from '../../../hooks/marketVolatilityContext'
import { ODDS_RUNS, retirementOddsLine } from './retirementOddsLine'
import { formatMoneyShort } from '../chartTheme'
import { planMoneyLabel } from '../planMoneyLabel'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

const BALANCE_COLOR = '#8b5cf6'

const FIRE_LEGEND: LegendItem[] = [
  { label: 'Portfolio balance', color: BALANCE_COLOR },
  { label: 'FI target', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' },
]

/**
 * How often the money lasts, from the target the plan is after: at its own rate and at the usual ones.
 * The line before stays until the edits have stopped for a moment, and while the card is far from the
 * screen (none if there was not one yet).
 */
function useOddsLine(draft: NewGoalScenario, paused: boolean): string | null {
  const format = useMoneyFormat()
  const volatility = useMarketVolatility()
  const settled = useReplayInput(draft, paused)
  const waiting = settled === undefined
  const { annualSpendCents = 0, safeWithdrawalRate = 0, expectedRealReturn = 0, retirementYears = 0 } = settled ?? {}
  return useMemo(() => {
    if (waiting || annualSpendCents <= 0 || safeWithdrawalRate <= 0) return null
    const rates = [safeWithdrawalRate, ...FI_TARGET_RATES.filter((rate) => Math.abs(rate - safeWithdrawalRate) > 1e-9)]
    const results = rates.map((rate) => ({
      rate,
      odds: replayRetirement({
        startCents: fireNumber(annualSpendCents, rate),
        annualWithdrawalCents: annualSpendCents,
        realReturn: expectedRealReturn,
        volatility,
        years: retirementYears,
        runs: ODDS_RUNS,
      }),
    }))
    return retirementOddsLine({ rate: safeWithdrawalRate, years: retirementYears, realReturn: expectedRealReturn, volatility, results, format })
  }, [waiting, annualSpendCents, safeWithdrawalRate, expectedRealReturn, retirementYears, volatility, format])
}

function FireChartImpl({
  draft,
  height = 210,
  embedded = false,
  paused = false,
}: {
  draft: NewGoalScenario
  height?: number
  embedded?: boolean
  /** The card is far from the screen: leave the odds as they are until it is near again. */
  paused?: boolean
}) {
  const inflationRate = useAssumedInflation()
  const { fiTarget, fiYear, balances } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const target = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
    const year = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
    const growth = projectNetWorth(params)
    // Drawn from the year FI is reached. Where it never is there is no balance to draw: starting
    // the line at the target would show a portfolio the plan does not have.
    const drawdown =
      year == null
        ? []
        : projectDrawdown(
            growth[year]?.investedCents ?? target,
            draft.annualSpendCents,
            draft.expectedRealReturn,
            draft.retirementYears,
          )
    return { fiTarget: target, fiYear: year, balances: drawdown }
  }, [draft, inflationRate])

  const format = useMoneyFormat()
  const oddsLine = useOddsLine(draft, paused)
  const targets = fiTargetsLine(draft.annualSpendCents, (c) => formatMoneyShort(c, format), format)
  // The target is in the plan's euros; on the account it is more, by the inflation up to where the plan
  // reaches it, or up to the end of the plan when it does not.
  const target = bothMoneys({
    cents: fiTarget,
    years: fiYear ?? draft.horizonYears,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (c) => formatMoneyShort(c, format),
    format,
  })
  const labels = useMemo(() => sparseLabels(balances.map((_, y) => y), 5), [balances])
  const series: ChartSeries[] = [{ id: 'balance', color: BALANCE_COLOR, values: balances, width: 2 }]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: `Year ${i}`,
    lines: [{ label: 'Portfolio', value: formatMoneyShort(balances[i] ?? 0, format), color: BALANCE_COLOR, tone: 'neutral' }],
  })

  if (fiYear == null) {
    return (
      <ChartShell embedded={embedded}>
        <h3 className={styles.chartTitle}>FI drawdown</h3>
        <p className={styles.chartHint}>
          FI target {target.plan} in {target.planLabel} · not reached in the horizon ({aboutOnAccount(target)}, when
          the plan ends), so there is no drawdown to show. {targets}
        </p>
        {oddsLine ? <p className={styles.chartHint}>{oddsLine}</p> : null}
      </ChartShell>
    )
  }

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>FI drawdown</h3>
      <p className={styles.chartHint}>
        FI target {target.plan} in {target.planLabel} · reached year {fiYear} ({aboutOnAccount(target)}). {targets} Post-FI only: year 0
        on this chart is the FI year, not today, and it runs for the {draft.retirementYears} years the money
        must last. After that it takes the plan's return every year and withdraws a constant amount in{' '}
        {planMoneyLabel(draft.planStartDate, format)}, so it illustrates the target and is not a forecast: a bad run of
        early years would leave less.
      </p>
      {oddsLine ? <p className={styles.chartHint}>{oddsLine}</p> : null}
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[fiTarget]}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="FI drawdown projection by year"
        tooltip={tooltip}
      />
      <ChartLegend items={FIRE_LEGEND} />
    </ChartShell>
  )
}

export const FireChart = memo(FireChartImpl)
