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
 * `useBodyScrollLock` makes this the *only* way out. With scrolling switched
 * off, iOS cannot scroll the page to compensate, so the pan is the whole of
 * the movement and nothing corrects it afterwards.
 *
 * Only a visual viewport that is *smaller* than the layout one is followed. A
 * finger drag can pan the visual viewport without shrinking it — `offsetTop`
 * climbs while `height` stays equal to `innerHeight`, and nothing fixed moves
 * on screen. Following that number slid the sheet against the finger and back
 * on release. A keyboard or a pinch zoom is what shrinks the visual viewport,
 * and the only case where fixed content really is displaced. A shortfall under
 * a pixel is rounding between the two, not a shrink.
 *
 * Returns null where `visualViewport` is unavailable, so callers fall back to
 * plain CSS. Where it exists but nothing has panned — every desktop browser —
 * this reports `{ top: 0, height: innerHeight }`, which is what `inset: 0`
 * already produced. The behaviour only changes where the bug is.
 */
/** Null where the API is unavailable, so callers fall back to plain CSS. */
function readRect(): ViewportRect | null {
  const vv = window.visualViewport
  if (!vv) return null
  const shrunk = vv.height < window.innerHeight - 1
  return { top: shrunk ? vv.offsetTop : 0, height: vv.height }
}

/**
 * `frozen` keeps the last rect and stops listening. A sheet on its way out is a
 * snapshot animating away, and a viewport change while it leaves (its owner releasing
 * the scroll lock, the keyboard going) must not re-position it mid-animation. Freezing
 * is one-way in practice — a leaving overlay unmounts — so a rect is allowed to be
 * stale between unfreezing and the next viewport event.
 */
export function useVisualViewportRect(frozen = false): ViewportRect | null {
  // Read during render rather than in the effect: setting state synchronously
  // inside one costs a second commit, and the repo's lint rules reject it.
  // Anything that changes afterwards arrives as an event.
  const [rect, setRect] = useState<ViewportRect | null>(readRect)

  useEffect(() => {
    if (frozen) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setRect(readRect())
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [frozen])

  return rect
}
