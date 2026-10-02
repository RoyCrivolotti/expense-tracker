import { SegmentedControl } from '../../components/SegmentedControl'
import { GoalsMobileNav } from './GoalsMobileNav'
import { mobileSelection, mobileViewOf, type GoalsMobileView, type MobilePlanView, type TabView } from './goalsView'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

const VIEW_OPTIONS: { value: TabView; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'progress', label: 'Progress' },
  { value: 'setup', label: 'Setup' },
]

interface GoalsViewSwitchProps {
  view: TabView
  onViewChange: (next: TabView) => void
  planHalf: MobilePlanView
  onPlanHalfChange: (next: MobilePlanView) => void
}

/** Plan / Progress / Setup, or on a phone the one row of Chart / Adjust / Progress / Setup. */
export function GoalsViewSwitch({
  view,
  onViewChange,
  planHalf,
  onPlanHalfChange,
}: GoalsViewSwitchProps) {
  const narrow = useGoalsNarrow()
  if (!narrow) {
    return (
      <div className={styles.viewSwitcherRow}>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={onViewChange}
          ariaLabel="Goals view"
          layout="compact"
        />
      </div>
    )
  }

  const onMobileChange = (next: GoalsMobileView) => {
    const change = mobileSelection(next, view)
    if (change.half) onPlanHalfChange(change.half)
    if (change.view) onViewChange(change.view)
  }
  return <GoalsMobileNav value={mobileViewOf(view, planHalf)} onChange={onMobileChange} />
}
