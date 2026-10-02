import { useEffect, useRef, type ReactNode } from 'react'
import { trackScrollPadding } from '../hooks/scrollPadding'
import { PINNED_AIR_PX, isStuck, scrollToAnchor, stickyBottom } from '../hooks/stickyScroll'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { SegmentedControl } from './SegmentedControl'
import styles from './SectionTabs.module.css'

interface SectionTabsProps<T extends string> {
  /** Names the tab list's panel and its tabs, so it must differ between tab lists on a page. */
  id: string
  ariaLabel: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  /** The selected section's content. */
  children: ReactNode
}

/**
 * A page of sections as tabs: one row stuck under the app header so the next section is in
 * reach however far down this one has been scrolled, over the panel it swaps the content of.
 *
 * Tapping another section from down the page brings its content to the top, under the bar,
 * rather than leaving the scroll position wherever the old section's offset falls in the new one,
 * and a section that has been left comes back to where it was left. Tapping the one already
 * selected goes to the top of its content, which is the usual way to say "back to the top".
 *
 * The page's scroll padding covers the bar while it is mounted, so a control reached with the
 * keyboard is not left behind it. It is announced as tabs over one panel, named by the tab that
 * is selected.
 */
export function SectionTabs<T extends string>({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  children,
}: SectionTabsProps<T>) {
  const bar = useRef<HTMLDivElement>(null)
  const memory = useScrollMemory<T>()
  const tabs = { idPrefix: `${id}-tab`, panelId: `${id}-panel` }
  const anchorId = `${id}-content`

  useEffect(
    () =>
      trackScrollPadding({
        top: () => (bar.current ? stickyBottom(bar.current) : 0) + PINNED_AIR_PX,
        watch: () => [bar.current],
      }),
    [],
  )

  const select = (next: T) => {
    const stuck = isStuck(bar.current)
    if (next === value) {
      if (stuck) scrollToAnchor(anchorId, 'smooth')
      return
    }
    memory.leave(value)
    onChange(next)
    if (memory.recall(next)) return
    if (stuck) scrollToAnchor(anchorId, 'auto')
  }

  return (
    <div className={styles.stack}>
      <div ref={bar} className={styles.bar}>
        <SegmentedControl
          options={options}
          value={value}
          onChange={select}
          ariaLabel={ariaLabel}
          layout="bar"
          size="tall"
          tabs={tabs}
        />
      </div>
      <div
        id={tabs.panelId}
        role="tabpanel"
        aria-labelledby={`${tabs.idPrefix}-${value}`}
        className={styles.panel}
      >
        <div id={anchorId} className={styles.anchor} />
        {children}
      </div>
    </div>
  )
}
