import type { KeyboardEvent, RefObject } from 'react'

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

interface RadioGroupKeys {
  /** The option that is the group's one tab stop: the selected one, or the first when none is. */
  stop: number
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * The keyboard of a radio group or tab list, as native radio buttons have it: one tab stop for
 * the whole group, and the arrow keys, Home and End move the selection and the focus together.
 * `onSelect` is called with the index a key lands on, including the one already selected (the
 * caller decides whether that is news). Put `onKeyDown` on the element that holds the options,
 * whose children carry `role="radio"` or `role="tab"`, and `tabIndex={i === stop ? 0 : -1}` on each.
 */
export function useRadioGroupKeys({
  groupRef,
  count,
  selected,
  disabled = false,
  onSelect,
}: {
  groupRef: RefObject<HTMLElement | null>
  count: number
  /** Index of the selected option, -1 when none is. */
  selected: number
  disabled?: boolean
  onSelect: (index: number) => void
}): RadioGroupKeys {
  const stop = Math.max(selected, 0)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Alt/Cmd+Left is the browser's Back and Ctrl/Cmd+Home/End scroll the page: leave them alone.
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return
    const radios = optionElements(groupRef.current)
    // Step from the option that has focus, which is not the selected one when the parent has
    // not followed a change, or the selection moved while focus stayed; the tab stop otherwise.
    const focused = radios.indexOf(event.target as HTMLElement)
    const target = keyTarget(event.key, focused < 0 ? stop : focused, count)
    if (target === null) return
    event.preventDefault()
    onSelect(target)
    radios[target]?.focus()
  }

  return { stop, onKeyDown }
}
