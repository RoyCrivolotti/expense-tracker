import type { GoalScenario, Milestone } from '../../../types'
import { formatCents, milestoneLabelWithAmount, milestoneStanding, type MilestoneStanding } from '../../../engine'
import { Card } from '../../components/primitives'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate } from './checkinDate'
import styles from './goals.module.css'

interface Props {
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  /** The plan the unreached ones are dated against; null shows only the reached ones. */
  plan?: GoalScenario | null
}

/** Words for where a milestone stands, and a mark for the chip. */
function describe(standing: MilestoneStanding): { mark: string; text: string; tone: 'good' | 'bad' | 'muted' } | null {
  switch (standing.kind) {
    case 'reached':
      return { mark: '✓', text: `by ${formatCheckinDate(standing.on)}`, tone: 'good' }
    case 'on-track':
      return {
        mark: '→',
        text: `on track: ${formatCheckinDate(standing.expected)}, target ${formatCheckinDate(standing.target)}`,
        tone: 'good',
      }
    case 'late':
      return {
        mark: '→',
        text: `${standing.monthsLate} months late: ${formatCheckinDate(standing.expected)}, target ${formatCheckinDate(standing.target)}`,
        tone: 'bad',
      }
    case 'expected':
      return { mark: '→', text: `expected ${formatCheckinDate(standing.expected)}`, tone: 'muted' }
    case 'beyond-horizon':
      return {
        mark: '→',
        text: standing.target ? `not within the horizon, target ${formatCheckinDate(standing.target)}` : 'not within the horizon',
        tone: standing.target ? 'bad' : 'muted',
      }
    case 'unknown':
      return null
  }
}

/**
 * Every milestone with where it stands: reached by a check-in, or dated by the plan and set
 * against its target. Without a datable plan only the reached ones are worth a line.
 */
export function ReachedMilestones({ milestones, reached, plan = null }: Props) {
  const format = useMoneyFormat()
  const rows = milestones
    .map((m) => ({ m, standing: describe(milestoneStanding(m, plan, reached.get(m.amountCents))) }))
    .filter((r): r is { m: Milestone; standing: NonNullable<ReturnType<typeof describe>> } => r.standing !== null)
  if (rows.length === 0) return null
  const allReached = rows.every((r) => r.standing.mark === '✓')

  return (
    <Card>
      <h3 className={styles.chartTitle}>{allReached ? 'Milestones reached' : 'Milestones'}</h3>
      <ul className={styles.reachedChips}>
        {rows.map(({ m, standing }) => (
          <li key={m.amountCents} className={`${styles.reachedChip} ${toneClass(standing.tone)}`}>
            <span aria-hidden="true">{standing.mark}</span>
            <span>{milestoneLabelWithAmount(m, (c) => formatCents(c, format))}</span>
            <span className={styles.reachedChipDate}>{standing.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function toneClass(tone: 'good' | 'bad' | 'muted'): string {
  if (tone === 'good') return ''
  return (tone === 'bad' ? styles.milestoneChipLate : styles.milestoneChipMuted) ?? ''
}
