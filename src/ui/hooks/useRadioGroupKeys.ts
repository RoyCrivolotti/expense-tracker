import type { KeyboardEvent, RefObject } from 'react'

/** Which arrow keys step the selection: all four, or only Left and Right. */
export type RadioGroupArrows = 'all' | 'horizontal'

/** Where a key moves the selection in a radio group or tab list: arrows step and wrap, Home and End jump. */
function keyTarget(key: string, index: number, count: number, arrows: RadioGroupArrows): number | null {
  const next = (index + 1) % count
  const previous = (index - 1 + count) % count
  switch (key) {
    case 'ArrowRight':
      return next
    case 'ArrowLeft':
      return previous
    case 'ArrowDown':
      return arrows === 'all' ? next : null
    case 'ArrowUp':
      return arrows === 'all' ? previous : null
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
 *
 * A radio group takes all four arrows, as native radios do. A tab list is one row, so it takes
 * `arrows: 'horizontal'` and leaves Up and Down to the page: a tab that has just been clicked
 * has focus, and the arrow a reader presses next to scroll must not swap the section instead.
 */
export function useRadioGroupKeys({
  groupRef,
  count,
  selected,
  disabled = false,
  arrows = 'all',
  onSelect,
}: {
  groupRef: RefObject<HTMLElement | null>
  count: number
  /** Index of the selected option, -1 when none is. */
  selected: number
  disabled?: boolean
  arrows?: RadioGroupArrows
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
    const target = keyTarget(event.key, focused < 0 ? stop : focused, count, arrows)
    if (target === null) return
    event.preventDefault()
    onSelect(target)
    radios[target]?.focus()
  }

  return { stop, onKeyDown }
}
