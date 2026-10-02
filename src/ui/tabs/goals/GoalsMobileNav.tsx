import { useRef } from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'
import styles from './goals.module.css'

/** The phone's four Goals views: Plan is split in two there, so it has no segment of its own. */
export type GoalsMobileView = 'chart' | 'adjust' | 'progress' | 'setup'

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
 * Tapping a segment from down the page brings the view it opens to the top, rather than
 * leaving the scroll position wherever the old view's offset falls in the new one. That
 * includes tapping the segment already selected, which is the usual way to say "back to the
 * top" on a phone.
 */
export function GoalsMobileNav({ value, onChange }: GoalsMobileNavProps) {
  const anchor = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)

  const select = (next: GoalsMobileView) => {
    const a = anchor.current
    const r = row.current
    // The anchor sits where the row would be if it were not stuck. A row that has not moved
    // from there has nothing above it to scroll back to, so a tap near the top must not nudge.
    if (a && r && a.getBoundingClientRect().top < r.getBoundingClientRect().top - 0.5) {
      a.scrollIntoView({ block: 'start' })
    }
    onChange(next)
  }

  return (
    <>
      <div ref={anchor} className={styles.navAnchor} aria-hidden="true" />
      <div ref={row} className={styles.nav}>
        <SegmentedControl
          options={OPTIONS}
          value={value}
          onChange={select}
          ariaLabel="Goals view"
          layout="bar"
        />
      </div>
    </>
  )
}
