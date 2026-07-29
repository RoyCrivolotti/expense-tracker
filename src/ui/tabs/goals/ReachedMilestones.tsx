import type { Milestone } from '../../../types'
import { formatCents, milestoneLabel } from '../../../engine'
import { Card } from '../../components/primitives'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './goals.module.css'

interface Props {
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
}

/** Milestones your check-ins show you have already passed, newest last. */
export function ReachedMilestones({ milestones, reached }: Props) {
  const format = useMoneyFormat()
  const hit = milestones.filter((m) => reached.has(m.amountCents))
  if (hit.length === 0) return null

  return (
    <Card>
      <h3 className={styles.chartTitle}>Milestones reached</h3>
      <ul className={styles.reachedChips}>
        {hit.map((m) => (
          <li key={m.amountCents} className={styles.reachedChip}>
            <span aria-hidden="true">✓</span>
            <span>{milestoneLabel(m, (c) => formatCents(c, format))}</span>
            <span className={styles.reachedChipDate}>by {reached.get(m.amountCents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
