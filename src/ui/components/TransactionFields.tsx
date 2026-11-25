import type { ReactNode } from 'react'
import type { TypeChoice } from './transactionTypes'
import styles from './TransactionForm.module.css'

export function Field({
  label,
  children,
  as = 'label',
}: {
  label: string
  children: ReactNode
  /**
   * A <label> forwards a click anywhere in it — including the caption text —
   * to its wrapped control (that's how "click a checkbox's label" works).
   * NativeDateOverlay opens the native picker on click, so wrapping it in a
   * <label> means clicking the "Date"/"Budget month" caption also opens the
   * picker, not just the pill. Use 'div' there — it drops the implicit
   * label/control association (compensate with NativeDateOverlay's own
   * `ariaLabel`), scoping the click-to-open surface to the pill itself.
   */
  as?: 'label' | 'div'
}) {
  const Tag = as
  return (
    <Tag className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </Tag>
  )
}

export function TypeSelector<T extends TypeChoice>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (t: T) => void
}) {
  return (
    <div className={styles.types} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((t) => (
        <button
          key={t.value}
          type="button"
          data-type={t.value}
          className={`${styles.typeBtn} ${value === t.value ? styles.typeActive : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
