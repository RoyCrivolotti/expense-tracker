import { useEffect, useState } from 'react'

/**
 * How much shorter than the layout viewport the visible area has to be before it is a keyboard.
 * The shortest software keyboard is over 200pt; anything under this is browser chrome sliding
 * (the address bar, the iOS 26 toolbar) rather than something covering the bottom of the page.
 */
const KEYBOARD_MIN_PX = 150

/**
 * How long to keep hiding after the field loses focus while the visible area is still short. The
 * keyboard takes about 250ms to leave and the area grows back as it goes. The cap is for iOS
 * standalone, which sometimes leaves `visualViewport.height` short after the keyboard has gone
 * (WebKit bug 218983); without it the bar would stay hidden for good.
 */
const SETTLE_MS = 350

/** Input types that open a text keyboard. A date, a checkbox or a slider does not. */
const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number', ''])

/** True when focus is somewhere that opens a software keyboard. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly
  return el instanceof HTMLElement && el.isContentEditable === true
}

/**
 * True when a keyboard is covering the bottom of the page: the visible area is clearly shorter than
 * the layout viewport, and not because of a pinch zoom, which shrinks it too.
 */
function visibleAreaIsShort(): boolean {
  const vv = window.visualViewport
  if (!vv) return false
  if (vv.scale > 1.01) return false
  return vv.height < window.innerHeight - KEYBOARD_MIN_PX
}

/**
 * Whether a software keyboard is up over a field being typed in, and the same fact as a
 * `data-keyboard-open` attribute on `<html>` for the stylesheets of whatever is fixed along the
 * bottom edge.
 *
 * iOS does not resize the layout viewport for a keyboard. It pans a smaller visual viewport around
 * inside it to uncover the field, so every `position: fixed; bottom: 0` surface rides up with the
 * page and ends up drawn on top of the keyboard's accessory strip, with the sticky header gone off
 * the top. Nothing in CSS can pin a surface to the screen instead, and following the pan in script
 * flickers. The bottom surfaces are under the keyboard anyway, so they are hidden while it is up.
 *
 * Both signals are needed. Focus alone is wrong with a hardware keyboard, a floating iPad keyboard
 * or a field focused by script without a tap: nothing is covered and the bar belongs on screen. A
 * short visible area alone is wrong while the keyboard is still going away.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined
    const clearSettle = () => {
      if (settle !== undefined) clearTimeout(settle)
      settle = undefined
    }
    const evaluate = () => {
      const short = visibleAreaIsShort()
      if (short && isTextEntry(document.activeElement)) {
        clearSettle()
        setOpen(true)
      } else if (!short) {
        clearSettle()
        setOpen(false)
      } else {
        // Focus has gone but the area has not grown back yet.
        settle ??= setTimeout(() => {
          settle = undefined
          setOpen(false)
        }, SETTLE_MS)
      }
    }
    // Moving focus from one field to the next fires focusout and then focusin; reading the
    // active element in between would see the page body.
    const onFocusChange = () => setTimeout(evaluate, 0)

    const vv = window.visualViewport
    document.addEventListener('focusin', onFocusChange)
    document.addEventListener('focusout', onFocusChange)
    vv?.addEventListener('resize', evaluate)
    window.addEventListener('resize', evaluate)
    return () => {
      clearSettle()
      document.removeEventListener('focusin', onFocusChange)
      document.removeEventListener('focusout', onFocusChange)
      vv?.removeEventListener('resize', evaluate)
      window.removeEventListener('resize', evaluate)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.toggleAttribute('data-keyboard-open', open)
    return () => root.removeAttribute('data-keyboard-open')
  }, [open])

  return open
}
