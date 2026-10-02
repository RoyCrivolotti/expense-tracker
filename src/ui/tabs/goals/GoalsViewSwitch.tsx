import { SegmentedControl } from '../../components/SegmentedControl'
import { GoalsMobileNav, type GoalsMobileView } from './GoalsMobileNav'
import { useGoalsNarrow } from './useGoalsNarrow'
import progressStyles from './progress.module.css'

export type TabView = 'plan' | 'progress' | 'setup'
/** On a phone Plan is two screens, the chart and the controls, instead of one. */
export type MobilePlanView = 'chart' | 'adjust'

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
      <div className={progressStyles.viewSwitcherRow}>
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
    if (next === 'chart' || next === 'adjust') {
      onPlanHalfChange(next)
      // Moving between the halves is not a change of view, which drops what a view change
      // drops (the inflation preview).
      if (view !== 'plan') onViewChange('plan')
    } else {
      onViewChange(next)
    }
  }
  return <GoalsMobileNav value={view === 'plan' ? planHalf : view} onChange={onMobileChange} />
}
