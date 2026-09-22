import { useLayoutEffect, type RefObject } from 'react'

/**
 * Publishes an element's rendered height as a custom property on the document, for fixed
 * surfaces that have to sit above it. Measured rather than assumed because the selection
 * bar's label wraps at phone widths, so any fixed offset is wrong on exactly those screens.
 */
export function usePublishHeight(
  ref: RefObject<HTMLElement | null>,
  property: `--${string}`,
  enabled = true,
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const root = document.documentElement
    const publish = () => root.style.setProperty(property, `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(property)
    }
  }, [ref, property, enabled])
}
