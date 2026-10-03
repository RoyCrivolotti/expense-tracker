import { useEffect } from 'react'

/**
 * Asks for the toast to be shown in the side rail, away from the page, for as long as the caller
 * is mounted (Toast.module.css reads the attribute, from 1024px wide where the rail has room).
 *
 * The wide Goals plan holds its levers bar to the bottom edge, and the chart's legend, which
 * carries the values the toast's message is about, sits just above it. A toast centred over the
 * bar covered that legend for six seconds at 1280x800, and on a taller screen where the bar is
 * not at the edge it covered the bar's bottom instead. The rail beside the page is empty between
 * its links and its menu button, level with the bar, and nothing the page shows is under it.
 */
export function useToastAside(): void {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-toast-aside', '')
    return () => root.removeAttribute('data-toast-aside')
  }, [])
}
