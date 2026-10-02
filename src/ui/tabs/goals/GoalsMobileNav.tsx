import { useRef } from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'
import { GOALS_NAV_ID } from './goalsAnchors'
import { landOnAdjustControls } from './scrollToAdjustSection'
import { scrollToGoalsContent } from './scrollToGoalsContent'
import { GOALS_VIEW_TABS, optionsFrom, type GoalsMobileView } from './goalsView'
import type { GoalsScrollMemory } from './useGoalsScrollMemory'
import { usePinnedScrollPadding } from './usePinnedScrollPadding'
import styles from './goals.module.css'

const OPTIONS = optionsFrom<GoalsMobileView>({
  chart: 'Chart',
  adjust: 'Adjust',
  progress: 'Progress',
  assumptions: 'Assumptions',
})

interface GoalsMobileNavProps {
  value: GoalsMobileView
  onChange: (next: GoalsMobileView) => void
  /** Where the views were left, kept by the tab so a link that skips this row is remembered too. */
  memory: GoalsScrollMemory
}

/**
 * The one switcher for the Goals views on a phone, stuck under the app header so it is in
 * reach however far down a view has been scrolled.
 *
 * Tapping a segment from down the page brings that view's content to the top, under the row,
 * rather than leaving the scroll position wherever the old view's offset falls in the new
 * one, and a view that has been left comes back to where it was left. Tapping the segment
 * already selected goes to the top of its content, which is the usual way to say "back to the
 * top" on a phone.
 */
export function GoalsMobileNav({ value, onChange, memory }: GoalsMobileNavProps) {
  const row = useRef<HTMLDivElement>(null)
  usePinnedScrollPadding(value)

  const select = (next: GoalsMobileView) => {
    const rowEl = row.current
    // Stuck: the row has been carried down to its sticky top (as the browser resolved it,
    // safe-area inset included). A row still lower than that has nothing above it to scroll
    // back to, so a tap near the top must not nudge. The 0.5 is sub-pixel slack.
    const stuck =
      rowEl !== null &&
      rowEl.getBoundingClientRect().top <= (Number.parseFloat(getComputedStyle(rowEl).top) || 0) + 0.5
    onChange(next)
    if (next === value) {
      if (stuck) scrollToGoalsContent('smooth')
      return
    }
    if (memory.recall(next)) return
    if (next === 'adjust') {
      // Opening Adjust for the first time is a request for the controls, wherever the page was.
      landOnAdjustControls()
    } else if (stuck) {
      scrollToGoalsContent('auto')
    }
  }

  return (
    <>
      <div ref={row} id={GOALS_NAV_ID} className={`${styles.nav} ${styles.fadeBelow}`}>
        <SegmentedControl
          options={OPTIONS}
          value={value}
          onChange={select}
          ariaLabel="Goals view"
          layout="bar"
          size="tall"
          tabs={GOALS_VIEW_TABS}
        />
      </div>
    </>
  )
}
