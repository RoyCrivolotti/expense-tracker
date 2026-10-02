import { useRef, type KeyboardEvent } from 'react'
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

/** Where a key moves the selection in a radio group or tab list: arrows step and wrap, Home and End jump. */
function keyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/** The options of a group as elements, in order: what a key moves focus between. */
function optionElements(group: HTMLElement | null): HTMLElement[] {
  return group ? Array.from(group.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')) : []
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
  // One tab stop for the whole group, on the selected option (the first when none is): the
  // arrow keys move within it, as they do between native radio buttons.
  const stop = Math.max(selected, 0)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Alt/Cmd+Left is the browser's Back and Ctrl/Cmd+Home/End scroll the page: leave them alone.
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return
    const radios = optionElements(group.current)
    // Step from the option that has focus, which is not the selected one when the parent has
    // not followed a change, or the selection moved while focus stayed; the tab stop otherwise.
    const focused = radios.indexOf(event.target as HTMLElement)
    const target = keyTarget(event.key, focused < 0 ? stop : focused, options.length)
    if (target === null) return
    const option = options[target]
    if (!option) return
    event.preventDefault()
    // A key that lands on the chosen option has nothing to report (a click on it does, for a
    // control that treats tapping the current segment as a request of its own).
    if (option.value !== value) onChange(option.value)
    radios[target]?.focus()
  }

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
