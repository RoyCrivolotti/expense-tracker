import { useRef } from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'
import { landOnAdjustControls } from './scrollToAdjustSection'
import { scrollToGoalsContent } from './scrollToGoalsContent'
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
 * one. Tapping the segment already selected does the same, which is the usual way to say
 * "back to the top" on a phone.
 */
export function GoalsMobileNav({ value, onChange }: GoalsMobileNavProps) {
  const row = useRef<HTMLDivElement>(null)

  const select = (next: GoalsMobileView) => {
    const rowEl = row.current
    // Stuck: the row has been carried down to its sticky top (as the browser resolved it,
    // safe-area inset included). A row still lower than that has nothing above it to scroll
    // back to, so a tap near the top must not nudge. The 0.5 is sub-pixel slack.
    const stuck =
      rowEl !== null &&
      rowEl.getBoundingClientRect().top <= (Number.parseFloat(getComputedStyle(rowEl).top) || 0) + 0.5
    onChange(next)
    // Opening Adjust is a request for the controls, wherever the page was.
    if (next === 'adjust' && value !== 'adjust') landOnAdjustControls()
    else if (stuck) scrollToGoalsContent(next === value ? 'smooth' : 'auto')
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
