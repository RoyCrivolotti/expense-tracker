import type { ReactNode } from 'react'
import { Card } from '../../components/primitives'
import styles from './shared.module.css'

/**
 * What a card is waiting for, said in one plain line. It stands where the card's content would be,
 * and is shown by the same condition that leaves the card empty, so it never contradicts a figure.
 */
export function NeedsLine({ children }: { children: ReactNode }) {
  return <p className={styles.needs}>{children}</p>
}

/** A whole card that has nothing to show yet: its title and what it needs. */
export function NeedsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className={styles.needsTitle}>{title}</h3>
      <NeedsLine>{children}</NeedsLine>
    </Card>
  )
}
