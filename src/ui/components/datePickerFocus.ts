export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Arrow keys move focus between the day buttons of the open grid. */
export function moveGridFocus(
  e: KeyboardEvent,
  container: HTMLElement | null,
): void {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
  if (!container) return
  const buttons = Array.from(container.querySelectorAll<HTMLElement>('[role="grid"] button'))
  const idx = buttons.indexOf(document.activeElement as HTMLElement)
  if (idx === -1) return

  let next = idx
  if (e.key === 'ArrowRight') next = idx + 1
  else if (e.key === 'ArrowLeft') next = idx - 1
  else if (e.key === 'ArrowDown') next = idx + 7
  else if (e.key === 'ArrowUp') next = idx - 7

  if (next >= 0 && next < buttons.length) {
    e.preventDefault()
    buttons[next]!.focus()
  }
}
