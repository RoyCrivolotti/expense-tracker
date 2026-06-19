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
  /** compact: inline pill. bar: full-width equal segments. */
  layout?: 'compact' | 'bar'
}

/** Compact pill-style toggle for small sets of mutually exclusive options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layout = 'compact',
}: SegmentedControlProps<T>) {
  const groupClass = layout === 'bar' ? `${styles.group} ${styles.groupBar}` : styles.group
  return (
    <div className={groupClass} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={opt.value === value ? `${styles.seg} ${styles.active}` : styles.seg}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
