import { useEffect } from 'react'

let lockCount = 0
let savedScrollY = 0
let savedStyle: { overflow: string; position: string; top: string; width: string } | null = null

/**
 * True while any sheet holds the page pinned.
 *
 * Published because the lock has a side effect that is easy to miss: with `body` at
 * `position: fixed; top: -<scrollY>px`, `window.scrollY` reads 0 no matter where the
 * page actually sits. Anything reading "scrollY is 0" as "the user is at the top of
 * the page" has to tell those two apart — see `usePullToRefresh`.
 */
export function isBodyScrollLocked(): boolean {
  return lockCount > 0
}

/** Prevent the page behind a modal from scrolling (reliable on iOS PWA).
 *  Reference-counted: nested locks (e.g. a ConfirmSheet inside a Modal)
 *  increment the counter without re-capturing the scroll position, and only
 *  the last unlock restores the body. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (lockCount === 0) {
      const { style } = document.body
      savedScrollY = window.scrollY
      savedStyle = {
        overflow: style.overflow,
        position: style.position,
        top: style.top,
        width: style.width,
      }
      style.overflow = 'hidden'
      style.position = 'fixed'
      style.top = `-${savedScrollY}px`
      style.width = '100%'
    }
    lockCount++
    return () => {
      lockCount--
      if (lockCount === 0 && savedStyle) {
        const { style } = document.body
        style.overflow = savedStyle.overflow
        style.position = savedStyle.position
        style.top = savedStyle.top
        style.width = savedStyle.width
        window.scrollTo(0, savedScrollY)
        savedStyle = null
      }
    }
  }, [active])
}
