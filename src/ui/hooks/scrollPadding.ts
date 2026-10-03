/**
 * The top padding again as a custom property, for what has to take it back out of its scroll
 * margin: the browser adds a target's margin to the page's padding, so an anchor that is put just
 * under what is pinned on purpose would land too low, and the pinned blocks themselves would
 * count as hidden and be scrolled to.
 */
const TOP_PADDING_VAR = '--scroll-pad-top'

interface ScrollPaddingOptions {
  /** How far down the page's visible area starts, in px: the bottom edge of what is pinned over it. */
  top: () => number
  /** What `top` depends on the size of, to measure again when it changes. Looked up once. */
  watch: () => readonly (Element | null)[]
}

/**
 * Tell the browser where the page's visible area starts while a page pins something under the
 * header, so a control that takes focus from the keyboard is scrolled clear of it. The app's own
 * padding is set in CSS (theme.css) for the header and the bottom bar; this is for a page that
 * pins more at the top, and replaces that on the root element until the returned function is
 * called, which puts back whatever was there.
 */
export function trackScrollPadding({ top, watch }: ScrollPaddingOptions): () => void {
  const root = document.documentElement
  const before = {
    top: root.style.scrollPaddingTop,
    topVar: root.style.getPropertyValue(TOP_PADDING_VAR),
  }
  const apply = () => {
    const padding = `${top()}px`
    root.style.scrollPaddingTop = padding
    root.style.setProperty(TOP_PADDING_VAR, padding)
  }
  apply()

  window.addEventListener('resize', apply)
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null
  for (const el of watch()) if (el) observer?.observe(el)

  return () => {
    window.removeEventListener('resize', apply)
    observer?.disconnect()
    root.style.scrollPaddingTop = before.top
    if (before.topVar) root.style.setProperty(TOP_PADDING_VAR, before.topVar)
    else root.style.removeProperty(TOP_PADDING_VAR)
  }
}
