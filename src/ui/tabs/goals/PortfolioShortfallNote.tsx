import { useMemo } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCentsCompact, portfolioShortfall, scenarioToParams } from '../../../engine'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './goals.module.css'

/**
 * Said under the hero when the plan takes the portfolio below zero: a house or a life event that
 * costs more than it holds. The chart carries that as a negative balance, which grows like a
 * debt, so the figures from that year on are not a plan to follow and the reader is told before
 * they rely on them. Nothing when the portfolio always covers what comes out of it.
 */
export function PortfolioShortfallNote({ draft }: { draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const shortfall = useMemo(() => portfolioShortfall(scenarioToParams(draft, inflationRate)), [draft, inflationRate])
  if (!shortfall) return null
  const money = (cents: number) => formatCentsCompact(cents, format)
  const house = shortfall.cause === 'house'
  return (
    <div className={styles.shortfallNote} role="note">
      <strong>
        {house
          ? `The house needs more than the portfolio holds in year ${shortfall.year}.`
          : `A life event takes the portfolio below zero in year ${shortfall.year}.`}
      </strong>{' '}
      {house
        ? `It takes ${money(shortfall.housePaymentCents)} out (the down payment and the costs) and leaves the portfolio ${money(shortfall.belowZeroCents)} below zero.`
        : `The portfolio ends that year ${money(shortfall.belowZeroCents)} below zero.`}{' '}
      The chart carries that as a negative balance, so the figures from that year on are not a plan you could follow.{' '}
      {house
        ? 'Buy later, put less down or invest more first.'
        : 'Move the event, make it smaller or invest more first.'}
    </div>
  )
}
