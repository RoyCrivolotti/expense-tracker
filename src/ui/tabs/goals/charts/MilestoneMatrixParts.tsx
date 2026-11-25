import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount, shortMonthYearLabel } from '../../../../engine'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { ExpandIcon } from '../../../icons'
import { pageLabel } from './milestoneTable'
import { type MilestoneRow } from './milestoneModel'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

export function Legend({ longest, plan }: { longest: number; plan: MilestoneRow | null }) {
  return (
    <ul className={styles.matrixLegend}>
      <li>
        <span className={styles.matrixLegendDone} aria-hidden="true">
          ✓
        </span>
        Already there
      </li>
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyTint}`} aria-hidden="true" />
        Darker: further away (the darkest is {longest} {longest === 1 ? 'year' : 'years'})
      </li>
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyBeyond}`} aria-hidden="true" />
        Hatched: not within the path&apos;s horizon
      </li>
      {plan ? (
        <li>
          <span aria-hidden="true">
            <span className={styles.matrixLegendSooner}>&minus;2y</span> +3y
          </span>{' '}
          Years sooner or later than {plan.name}, the plan
        </li>
      ) : null}
    </ul>
  )
}

const PHONE_VIEWS = [
  { value: 'table', label: 'Table' },
  { value: 'goal', label: 'By goal' },
] as const

export type PhoneView = (typeof PHONE_VIEWS)[number]['value']

/**
 * The milestones every path already has, said once in words instead of as a column of ticks.
 * A date is given where the check-ins saw the milestone reached.
 */
export function FoldedLine({
  milestones,
  indices,
  reached,
}: {
  milestones: Milestone[]
  indices: number[]
  reached: Map<number, string>
}) {
  const format = useMoneyFormat()
  if (indices.length === 0) return null
  const parts = indices.map((i) =>
    milestoneLabelWithAmount(milestones[i] as Milestone, (cents) => formatMoneyShort(cents, format)),
  )
  // The check-ins' date is said once when they all agree on it: five dates in a row are noise.
  const dates = new Set(indices.map((i) => reached.get((milestones[i] as Milestone).amountCents)))
  const [date] = dates
  return (
    <p className={styles.matrixFolded}>
      <span aria-hidden="true">✓ </span>
      Already there on every path: {parts.join(', ')}
      {dates.size === 1 && date ? ` (by ${shortMonthYearLabel(date)})` : ''}
    </p>
  )
}

/**
 * The two ways to read the table on a phone, which page of milestones the table is on, and, where
 * it has more than one, the way to open every milestone at once.
 */
export function PhoneTools({
  view,
  onView,
  pages,
  page,
  onPage,
  label,
  onSheet,
}: {
  view: PhoneView
  onView: (view: PhoneView) => void
  pages: number[][]
  page: number
  onPage: (page: number) => void
  label: (index: number) => string
  onSheet: () => void
}) {
  return (
    <div className={styles.matrixPhoneTools}>
      <div className={styles.matrixPhoneRow}>
        <SegmentedControl
          options={[...PHONE_VIEWS]}
          value={view}
          onChange={onView}
          ariaLabel="Read the milestones as"
        />
        {pages.length > 1 ? (
          <button type="button" className={styles.matrixToggle} onClick={onSheet}>
            <ExpandIcon className={styles.matrixToggleIcon} aria-hidden="true" />
            All milestones
          </button>
        ) : null}
      </div>
      {view === 'table' && pages.length > 1 ? (
        <SegmentedControl
          layout="scroll"
          ariaLabel="Milestones shown"
          value={String(page)}
          onChange={(value) => onPage(Number(value))}
          options={pages.map((p, i) => ({
            value: String(i),
            label: pageLabel(label(p[0] as number), label(p[p.length - 1] as number)),
          }))}
        />
      ) : null}
    </div>
  )
}
