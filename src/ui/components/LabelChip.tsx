import type { CSSProperties } from 'react'
import type { Label } from '../../types'
import styles from './LabelChip.module.css'

/**
 * One label, as a small filled pill. Several can sit side by side on a
 * transaction row — unlike a flag, which is at most one per transaction — so
 * this stays a single-label chip and the caller (TransactionRowBody) decides
 * how many to show and how to summarise the rest.
 */
export function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className={styles.chip}
      style={{ '--label-color': label.color } as CSSProperties}
      title={label.description ? `${label.name} — ${label.description}` : label.name}
    >
      {label.name}
    </span>
  )
}

/** The "+N" pill for labels that did not fit. */
export function LabelChipOverflow({ count }: { count: number }) {
  return <span className={styles.overflow}>+{count}</span>
}
