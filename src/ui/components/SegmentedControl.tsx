import { useRef } from 'react'
import { useRadioGroupKeys } from '../hooks/useRadioGroupKeys'
import styles from './SegmentedControl.module.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface TabsProps {
  idPrefix: string
  panelId: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** compact: inline pill. bar: full-width equal segments. scroll: horizontal chip row. */
  layout?: 'compact' | 'bar' | 'scroll'
  /**
   * tall: a bar that fills the height it is given, with one-line labels and segments as tall as
   * the bar. For the control a page is navigated by, where a thumb must hit it mid-scroll.
   * Only the bar layout has it.
   */
  size?: 'default' | 'tall'
  /**
   * For a control that swaps which panel of content is shown, not one that picks a value: it
   * is announced as tabs. `idPrefix` names each tab (`<idPrefix>-<value>`, for the panel's
   * `aria-labelledby`) and `panelId` is the panel they all control. The keyboard is the same.
   */
  tabs?: TabsProps
  disabled?: boolean
}

/** What makes an option a radio, or a tab, and says whether it is the chosen one. */
function optionAttributes(value: string, chosen: boolean, tabs: TabsProps | undefined) {
  if (!tabs) return { role: 'radio', 'aria-checked': chosen }
  return {
    role: 'tab',
    'aria-selected': chosen,
    'aria-controls': tabs.panelId,
    id: `${tabs.idPrefix}-${value}`,
  }
}

/** Compact pill-style toggle for small sets of mutually exclusive options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  layout = 'compact',
  size = 'default',
  tabs,
  disabled = false,
}: SegmentedControlProps<T>) {
  const groupClass =
    layout === 'bar'
      ? `${styles.group} ${styles.groupBar}${size === 'tall' ? ` ${styles.tall}` : ''}`
      : layout === 'scroll'
        ? `${styles.group} ${styles.groupScroll}`
        : styles.group
  const group = useRef<HTMLDivElement>(null)
  const selected = options.findIndex((o) => o.value === value)
  const { stop, onKeyDown } = useRadioGroupKeys({
    groupRef: group,
    count: options.length,
    selected,
    disabled,
    arrows: tabs ? 'horizontal' : 'all',
    // A key that lands on the chosen option has nothing to report (a click on it does, for a
    // control that treats tapping the current segment as a request of its own).
    onSelect: (index) => {
      const option = options[index]
      if (option && option.value !== value) onChange(option.value)
    },
  })

  return (
    <div
      ref={group}
      className={groupClass}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          {...optionAttributes(opt.value, opt.value === value, tabs)}
          tabIndex={i === stop ? 0 : -1}
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
