import { useEffect, useRef } from 'react'
import styles from './SegmentedControl.module.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** compact: inline pill. bar: full-width equal segments. scroll: horizontal chip row. */
  layout?: 'compact' | 'bar' | 'scroll'
  disabled?: boolean
}

/** Compact pill-style toggle for small sets of mutually exclusive options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layout = 'compact',
  disabled = false,
}: SegmentedControlProps<T>) {
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll rows can hold more options than fit on screen — bring the active
  // one into view rather than leaving it hidden off to one side.
  useEffect(() => {
    if (layout !== 'scroll') return
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [layout, value])

  const groupClass =
    layout === 'bar'
      ? `${styles.group} ${styles.groupBar}`
      : layout === 'scroll'
        ? `${styles.group} ${styles.groupScroll}`
        : styles.group
  return (
    <div className={groupClass} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          ref={opt.value === value ? activeRef : undefined}
          role="radio"
          aria-checked={opt.value === value}
          className={
            opt.value === value ? `${styles.seg} tapActive ${styles.active}` : `${styles.seg} tapActive`
          }
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
