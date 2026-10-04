import { SegmentedControl } from '../../../components/SegmentedControl'
import type { YearsUnit } from './milestoneModel'
import styles from '../goals.module.css'

const UNITS = [
  { value: 'years', label: 'Years from now' },
  { value: 'calendar', label: 'Calendar year' },
] as const

const NO_PLAN = 'No scenario is marked as your current plan, so there is nothing to compare with.'

/** How each milestone is counted, and whether the table compares with the plan. */
export function MilestoneToolbar({
  unit,
  onUnit,
  vsPlan,
  onVsPlan,
  hasPlan,
}: {
  unit: YearsUnit
  onUnit: (unit: YearsUnit) => void
  vsPlan: boolean
  onVsPlan: () => void
  hasPlan: boolean
}) {
  return (
    <div className={styles.matrixTools}>
      <SegmentedControl options={[...UNITS]} value={unit} onChange={onUnit} ariaLabel="Show each milestone as" />
      <button
        type="button"
        className={styles.matrixToggle}
        aria-pressed={hasPlan && vsPlan}
        disabled={!hasPlan}
        title={hasPlan ? 'Show how many years sooner or later each path gets there than the plan' : NO_PLAN}
        onClick={onVsPlan}
      >
        vs plan
      </button>
    </div>
  )
}
