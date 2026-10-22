import type { ReactNode } from 'react'
import styles from './StaleList.module.css'

/**
 * Frames a list that may show rows of the filter before the current one: dimmed, and marked busy for screen
 * readers, until the new rows come. A list that is never stale (`stale` undefined) is not framed at all, so it is
 * drawn as it always was.
 */
export function StaleList({ stale, children }: { stale?: boolean | undefined; children: ReactNode }) {
  if (stale === undefined) return <>{children}</>
  return (
    <div className={stale ? `${styles.frame} ${styles.stale}` : styles.frame} aria-busy={stale}>
      {children}
    </div>
  )
}
