import { useRef } from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'
import { landOnAdjustControls } from './scrollToAdjustSection'
import { restoreScrollPosition, scrollToGoalsContent } from './scrollToGoalsContent'
import type { GoalsMobileView } from './goalsView'
import styles from './goals.module.css'

const OPTIONS: { value: GoalsMobileView; label: string }[] = [
  { value: 'chart', label: 'Chart' },
  { value: 'adjust', label: 'Adjust' },
  { value: 'progress', label: 'Progress' },
  { value: 'setup', label: 'Setup' },
]

interface GoalsMobileNavProps {
  value: GoalsMobileView
  onChange: (next: GoalsMobileView) => void
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
export function GoalsMobileNav({ value, onChange }: GoalsMobileNavProps) {
  const row = useRef<HTMLDivElement>(null)
  const left = useRef<Partial<Record<GoalsMobileView, number>>>({})

  const select = (next: GoalsMobileView) => {
    const rowEl = row.current
    // Stuck: the row has been carried down to its sticky top (as the browser resolved it,
    // safe-area inset included). A row still lower than that has nothing above it to scroll
    // back to, so a tap near the top must not nudge. The 0.5 is sub-pixel slack.
    const stuck =
      rowEl !== null &&
      rowEl.getBoundingClientRect().top <= (Number.parseFloat(getComputedStyle(rowEl).top) || 0) + 0.5
    if (next !== value) left.current[value] = window.scrollY
    onChange(next)
    const before = left.current[next]
    if (next === value) {
      if (stuck) scrollToGoalsContent('smooth')
    } else if (before !== undefined) {
      restoreScrollPosition(before)
    } else if (next === 'adjust') {
      // Opening Adjust for the first time is a request for the controls, wherever the page was.
      landOnAdjustControls()
    } else if (stuck) {
      scrollToGoalsContent('auto')
    }
  }

  return (
    <>
      <div ref={row} className={`${styles.nav} ${styles.fadeBelow}`}>
        <SegmentedControl
          options={OPTIONS}
          value={value}
          onChange={select}
          ariaLabel="Goals view"
          layout="bar"
          size="tall"
        />
      </div>
    </>
  )
}
