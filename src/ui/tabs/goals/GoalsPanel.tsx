import type { ReactNode } from 'react'
import { GOALS_VIEW_TABS, mobileViewOf, type MobilePlanView, type TabView } from './goalsView'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

interface GoalsPanelProps {
  view: TabView
  planHalf: MobilePlanView
  children: ReactNode
}

/**
 * Everything under the view row: the one panel its tabs swap the content of, named by the tab
 * that is selected. The row stays outside it, a direct child of the stack, so it sticks for
 * the whole length of the page.
 */
export function GoalsPanel({ view, planHalf, children }: GoalsPanelProps) {
  const narrow = useGoalsNarrow()
  const tab = narrow ? mobileViewOf(view, planHalf) : view
  return (
    <div
      id={GOALS_VIEW_TABS.panelId}
      role="tabpanel"
      aria-labelledby={`${GOALS_VIEW_TABS.idPrefix}-${tab}`}
      className={styles.viewPanel}
    >
      {children}
    </div>
  )
}
