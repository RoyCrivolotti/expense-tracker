import { afterRender } from '../../../hooks/scrollTiming'

/** Every star button, in the bar and in the panel. */
const STAR = 'button[data-star]'

/** What holds a list of stars: the bar's row of levers, or the inputs panel. */
export const STAR_HOME_ATTR = 'data-star-home'

/**
 * Presses a star with `toggle` without losing the keyboard's place. The star that has focus is
 * the one that goes (the lever leaves the bar, the input leaves the panel), and focus on an
 * element that is removed falls to the page, so the next Tab starts from the top. It goes to the
 * star that takes the pressed one's place in the same list, else the last one left, else to
 * `fallback`.
 *
 * Only a star that has focus is followed: a press that did not focus it (Safari does not focus
 * a button on click) has no place to keep.
 */
export function toggleKeepingFocus(toggle: () => void, fallback: () => HTMLElement | null): void {
  const pressed = document.activeElement
  const home = pressed instanceof HTMLElement && pressed.matches(STAR) ? pressed.closest(`[${STAR_HOME_ATTR}]`) : null
  if (!(pressed instanceof HTMLElement) || home === null) {
    toggle()
    return
  }
  const index = [...home.querySelectorAll(STAR)].indexOf(pressed)
  toggle()
  afterRender(() => {
    // Stars held back (the bar is full) cannot take focus, so they do not count.
    const open = home.isConnected ? [...home.querySelectorAll<HTMLElement>(`${STAR}:not(:disabled)`)] : []
    const target = open[Math.min(index, open.length - 1)] ?? fallback()
    target?.focus()
  })
}
