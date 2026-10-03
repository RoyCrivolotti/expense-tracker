import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount } from '../../../../engine'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../chartTheme'
import { getNarrativeStats } from '../narrativeStats'
import styles from './planDesktop.module.css'

/**
 * Where the plan gets to, in a line under the hero's legend: the year it reaches financial
 * independence and the year it crosses the next milestone. These are what the phone's summary box
 * says besides the net worth, which on a wide screen is in the levers bar, beside the inputs that
 * move it, so the box would only say it twice. Nothing when the plan reaches neither.
 */
export function PlanStrip({ draft, milestones }: { draft: NewGoalScenario; milestones: Milestone[] }) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const { next, fiYear } = getNarrativeStats(draft, milestones, inflationRate)
  const items = [
    fiYear != null ? { label: 'Financial independence', value: `Year ${fiYear}` } : null,
    next?.year != null
      ? {
          label: `${milestoneLabelWithAmount(next.milestone, (cents) => formatMoneyShort(cents, format))} invested`,
          value: `Year ${next.year}`,
        }
      : null,
  ].filter((item): item is { label: string; value: string } => item !== null)
  if (items.length === 0) return null
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
