import type { ReactNode } from 'react'
import styles from '../goals.module.css'

/**
 * A table that may be wider than its card. It scrolls sideways, and a keyboard has to be able
 * to get there to do it: a scroller that is not focusable cannot be scrolled in Safari, which
 * leaves a column unreachable. It is a named region so a screen reader says what it is, and the
 * stylesheet draws an edge where there is more to scroll to.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.milestoneScroll} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
