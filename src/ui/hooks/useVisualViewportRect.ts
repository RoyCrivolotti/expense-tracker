import { useEffect, useState } from 'react'

export interface ViewportRect {
  /** Distance from the layout viewport's top to the visible area's top. */
  top: number
  height: number
}

/**
 * The visible slice of the screen, in the coordinates `position: fixed` uses.
 *
 * A fixed element is pinned to the **layout** viewport. When iOS opens a
 * keyboard it does not resize that viewport — it pans a smaller *visual*
 * viewport around inside it to bring the focused field into view. Everything
 * fixed therefore slides in the opposite direction, which is how a modal's
 * header ends up underneath the clock: the overlay's `top: 0` is still layout
 * y=0, but layout y=0 is now above the top of what you can see.
 *
 * `useBodyScrollLock` makes this the *only* way out. With `body` pinned at
 * `position: fixed`, iOS cannot scroll the page to compensate, so the pan is
 * the whole of the movement and nothing corrects it afterwards.
 *
 * Returns null where `visualViewport` is unavailable, so callers fall back to
 * plain CSS. Where it exists but nothing has panned — every desktop browser —
 * this reports `{ top: 0, height: innerHeight }`, which is what `inset: 0`
 * already produced. The behaviour only changes where the bug is.
 */
/** Null where the API is unavailable, so callers fall back to plain CSS. */
function readRect(): ViewportRect | null {
  const vv = window.visualViewport
  return vv ? { top: vv.offsetTop, height: vv.height } : null
}

export function useVisualViewportRect(): ViewportRect | null {
  // Read during render rather than in the effect: setting state synchronously
  // inside one costs a second commit, and the repo's lint rules reject it.
  // Anything that changes afterwards arrives as an event.
  const [rect, setRect] = useState<ViewportRect | null>(readRect)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setRect({ top: vv.offsetTop, height: vv.height })
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return rect
}
