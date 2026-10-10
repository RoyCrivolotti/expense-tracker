import { useLayoutEffect, useState, type RefObject } from 'react'

/** Whether the box is within `margin` px of the screen, above or below, measured from its own geometry. */
function isNear(el: Element, margin: number): boolean {
  const box = el.getBoundingClientRect()
  return box.bottom >= -margin && box.top <= window.innerHeight + margin
}

/**
 * Whether an element is within `margin` px of the screen, above or below it. It is measured once as
 * the element is first watched, since the observer's first report comes a frame late. Where there is
 * no IntersectionObserver (jsdom) the answer is always true, so what waits on it is still shown.
 */
export function useNearViewport(target: RefObject<Element | null>, margin: number): boolean {
  const observable = typeof IntersectionObserver !== 'undefined'
  const [near, setNear] = useState(false)
  useLayoutEffect(() => {
    const el = target.current
    if (!el || !observable) return undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNear(isNear(el, margin))
    // Entries come oldest first, and a box that left and came back between two frames brings both: the newest is where it is now.
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1]?.isIntersecting ?? false), { rootMargin: `${margin}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [target, margin, observable])
  return observable ? near : true
}
