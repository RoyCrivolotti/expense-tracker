import { SegmentedControl } from '../../components/SegmentedControl'
import { GoalsMobileNav } from './GoalsMobileNav'
import {
  GOALS_VIEW_TABS,
  mobileSelection,
  mobileViewOf,
  optionsFrom,
  type GoalsMobileView,
  type MobilePlanView,
  type TabView,
} from './goalsView'
import type { GoalsScrollMemory } from './useGoalsScrollMemory'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

const VIEW_OPTIONS = optionsFrom<TabView>({ plan: 'Plan', progress: 'Progress', assumptions: 'Assumptions' })

interface GoalsViewSwitchProps {
  view: TabView
  onViewChange: (next: TabView) => void
  planHalf: MobilePlanView
  onPlanHalfChange: (next: MobilePlanView) => void
  /** Where the phone's views were left; the wide switch has no use for it. */
  memory: GoalsScrollMemory
  /** The wide switch sits in the title's own row, so it has no row of its own to pad. */
  inline?: boolean
}

/** Plan / Progress / Assumptions, or on a phone the row of Chart / Progress / Scenarios / Assumptions. */
export function GoalsViewSwitch({
  view,
  onViewChange,
  planHalf,
  onPlanHalfChange,
  memory,
  inline = false,
}: GoalsViewSwitchProps) {
  const narrow = useGoalsNarrow()
  if (!narrow) {
    return (
      <div className={inline ? styles.viewSwitcherInline : styles.viewSwitcherRow}>
        <SegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={onViewChange}
          ariaLabel="Goals view"
          layout="compact"
          tabs={GOALS_VIEW_TABS}
        />
      </div>
    )
  }

  const onMobileChange = (next: GoalsMobileView) => {
    const change = mobileSelection(next, view)
    if (change.half) onPlanHalfChange(change.half)
    if (change.view) onViewChange(change.view)
  }
  return <GoalsMobileNav value={mobileViewOf(view, planHalf)} onChange={onMobileChange} memory={memory} />
}
