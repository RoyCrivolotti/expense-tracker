import type { ReactNode } from 'react'
import styles from './goals.module.css'

/**
 * A closed-by-default note under a card or an input: what a reader needs once, to check the numbers against their own
 * situation, kept out of the way of what they need every time. What stops a wrong decision stays outside it.
 */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={styles.moreInfo}>
      <summary className={styles.moreInfoSummary}>{title}</summary>
      <div className={styles.moreInfoBody}>{children}</div>
    </details>
  )
}
