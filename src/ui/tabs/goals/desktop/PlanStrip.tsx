import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount } from '../../../../engine'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../chartTheme'
import { bothMoneys, bothMoneysTail } from '../bothMoneys'
import { getNarrativeStats } from '../narrativeStats'
import styles from './planDesktop.module.css'

/**
 * Where the plan gets to, in a line under the hero's legend: the net worth it ends at, in the plan's euros
 * and on the account in that year (the levers bar beside the inputs has room for the first only), the year
 * it reaches financial independence and the year it crosses the next milestone.
 */
export function PlanStrip({ draft, milestones }: { draft: NewGoalScenario; milestones: Milestone[] }) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { end, next, fiYear } = getNarrativeStats(draft, milestones, inflationRate)
  const worth = bothMoneys({
    cents: end?.netWorthCents ?? 0,
    years: end?.year ?? 0,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (cents) => formatMoneyShort(cents, format),
    format,
  })
  const items = [
    {
      label: `Net worth at year ${draft.horizonYears}`,
      value: `${worth.plan} ${bothMoneysTail(worth)}`,
    },
    fiYear != null ? { label: 'Financial independence', value: `Year ${fiYear}` } : null,
    next?.year != null
      ? {
          label: `${milestoneLabelWithAmount(next.milestone, (cents) => formatMoneyShort(cents, format))} invested`,
          value: `Year ${next.year}`,
        }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null)
  return (
    <p className={styles.planStrip}>
      {items.map((item) => (
        <span key={item.label} className={styles.planStripItem}>
          <span className={styles.planStripLabel}>{item.label}</span> <strong>{item.value}</strong>
        </span>
      ))}
    </p>
  )
}
