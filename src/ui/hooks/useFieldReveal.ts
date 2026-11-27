import { useEffect, type RefObject } from 'react'
import { isTextEntry, KEYBOARD_OPEN_ATTR } from './useKeyboardOpen'
import { motionEnabled } from './motion'

/**
 * Where a sheet is a phone's bottom sheet: narrower than the width at which `Modal.module.css` turns it into a dialog in
 * the middle of the screen, or a phone on its side. The stylesheets that act on the keyboard mark use the same query.
 * An iPad's docked keyboard sets the mark too, but there the sheet is a dialog with room to spare and stays as it is.
 */
export const PHONE_LAYOUT = '(max-width: 559px), (max-height: 559px)'

/** Room left between the field's caption and a line held at the top of the sheet. */
export const REVEAL_GAP_PX = 12

/**
 * Room left above the field's caption when nothing is held at the top and the sheet's own edge is the limit. In an
 * installed app iOS 27 blurs and dims the page under the status bar a little past the bar itself, about 30pt into a
 * sheet that has grown to the top of the visible area; a caption closer to the edge than that reads dimmed.
 */
export const REVEAL_EDGE_GAP_PX = 32

/**
 * How far past the middle of the field above stays in view. The keyboard's up and down arrows on iOS (27, in the
 * simulator) only move to a field whose middle is on screen: with the field above scrolled out of the sheet, or only
 * its lower third showing, the up arrow did nothing, and with a little over half of it showing it moved there.
 */
export const REVEAL_PEEK_PX = 12

/** What the keyboard's arrows move between. A select is skipped by them, and so are checkboxes and file pickers. */
const ARROW_STOPS =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), textarea'

/**
 * How long the glide keeps following the field. Longer than the fold that collapses what sits above it while the
 * keyboard is up (`--motion-enter-sheet`), so the field lands where it ends up rather than where it was mid-fold.
 */
export const REVEAL_GLIDE_MS = 280

/** The share of the remaining distance covered each frame: about 99% of the way in a quarter of a second. */
const GLIDE_STEP = 0.3

/** A phone keyboard is up over a phone-sized layout. jsdom has no matchMedia, and there every layout is a phone's. */
function keyboardOpen(): boolean {
  if (!document.documentElement.hasAttribute(KEYBOARD_OPEN_ATTR)) return false
  return typeof matchMedia !== 'function' || matchMedia(PHONE_LAYOUT).matches
}

/**
 * Where the sheet's visible part starts, and the room a caption keeps below it: the foot of a line that sticks to the
 * top while a keyboard is up (`data-reveal-cover`, the review view's one-line summary of the bank's message), or else
 * the sheet's top edge. The line is measured where it is: until the sheet has scrolled far enough for it to stick it
 * sits lower, which only asks for less scrolling, and the next measurement finds it in place.
 */
function visibleTop(scroller: HTMLElement): { top: number; gap: number } {
  const edge = scroller.getBoundingClientRect().top + scroller.clientTop
  const cover = scroller.querySelector('[data-reveal-cover]')
  if (!cover || getComputedStyle(cover).position !== 'sticky') return { top: edge, gap: REVEAL_EDGE_GAP_PX }
  return { top: Math.max(edge, cover.getBoundingClientRect().bottom), gap: REVEAL_GAP_PX }
}

/** The last field before this one that the keyboard's up arrow could move to, if any. */
function fieldBefore(
  field: Element,
  scroller: HTMLElement,
): Element | null {
  let before: Element | null = null
  for (const stop of scroller.querySelectorAll(ARROW_STOPS)) {
    if (stop === field) return before
    if (!(stop as HTMLInputElement).disabled && stop.getClientRects().length > 0) before = stop
  }
  return null
}

/**
 * Where the scroller has to be for the field to sit at its top: the field's caption, when it has one, a gap below the
 * top of what the sheet shows, but never so far that the middle of the field above goes out of sight. The
 * browser clamps it at the end of what can scroll, which leaves a field near the end where it is, above the keyboard.
 */
export function revealTop(
  field: Element,
  scroller: HTMLElement,
): number {
  const { top, gap } = visibleTop(scroller)
  const anchor = field.closest('label') ?? field
  let target = scroller.scrollTop + anchor.getBoundingClientRect().top - top - gap
  const before = fieldBefore(field, scroller)
  if (before) {
    const { bottom, height } = before.getBoundingClientRect()
    target = Math.min(target, scroller.scrollTop + bottom - height / 2 - top - REVEAL_PEEK_PX)
  }
  return Math.max(0, target)
}

/**
 * With a phone keyboard up, keeps the field being typed in at the top of what the sheet still shows, so its text and
 * the suggestions that open under it are in view. Half of the field above stays showing, or the keyboard's up arrow
 * could not reach it.
 *
 * iOS only scrolls a focused field until its caret clears the keyboard, which leaves the field on the bottom line of
 * the visible area and anything it opens underneath out of sight. The keyboard also covers the sheet's lower part
 * for as long as it is up, so this moves the field up as soon as the keyboard has arrived (when `useKeyboardOpen`
 * marks `<html>`), and again each time focus moves to another field while it stays up, the keyboard's arrows
 * included. A hardware keyboard or a desktop never sets the mark, so nothing moves there, and neither does anything on
 * a screen wide enough for the sheet to be a dialog (`PHONE_LAYOUT`).
 *
 * The move glides, following the field for a moment: what collapses above it while the keyboard is up is still
 * folding as it starts. A finger on the sheet stops it.
 */
export function useFieldReveal(
  scrollerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!enabled || !scroller) return
    let frame: number | undefined
    let pending: ReturnType<typeof setTimeout> | undefined

    const stop = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
    }
    const reveal = () => {
      stop()
      const field = document.activeElement
      if (!field || !keyboardOpen() || !isTextEntry(field) || !scroller.contains(field)) return
      if (!motionEnabled()) {
        // Twice: a line that sticks to the top is only in its place once the first move has put it there.
        scroller.scrollTop = revealTop(field, scroller)
        scroller.scrollTop = revealTop(field, scroller)
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const target = revealTop(field, scroller)
        const done = now - start >= REVEAL_GLIDE_MS
        scroller.scrollTop = done ? target : scroller.scrollTop + (target - scroller.scrollTop) * GLIDE_STEP
        frame = done ? undefined : requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    // Focus moving between two fields fires focusout and then focusin, and iOS scrolls the new field into view
    // itself right after; a tick later both are over.
    const onFocusIn = () => {
      if (pending !== undefined) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = undefined
        reveal()
      }, 0)
    }
    const observer = new MutationObserver(() => {
      if (keyboardOpen()) reveal()
      else stop()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [KEYBOARD_OPEN_ATTR] })
    scroller.addEventListener('focusin', onFocusIn)
    scroller.addEventListener('touchstart', stop, { passive: true })
    scroller.addEventListener('wheel', stop, { passive: true })
    return () => {
      stop()
      if (pending !== undefined) clearTimeout(pending)
      observer.disconnect()
      scroller.removeEventListener('focusin', onFocusIn)
      scroller.removeEventListener('touchstart', stop)
      scroller.removeEventListener('wheel', stop)
    }
  }, [scrollerRef, enabled])
}
