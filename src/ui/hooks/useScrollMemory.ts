import { useMemo, useRef } from 'react'
import { restoreScroll } from './stickyScroll'

/** Where the sections of a page were left, and putting one back. */
export interface ScrollMemory<K extends string> {
  /** Note where the page is as `from` is left. */
  leave: (from: K) => void
  /** Put `key` back where it was left, once it has been rendered; false if it has not been left. */
  recall: (key: K) => boolean
}

/**
 * The scroll position each section of a page was left at, so tapping back to it lands where the
 * viewer was rather than at the top. It lives as long as the component that calls it: the
 * positions mean something on the page they were taken from, and are dropped with it.
 */
export function useScrollMemory<K extends string>(): ScrollMemory<K> {
  const left = useRef<Partial<Record<K, number>>>({})

  return useMemo(
    () => ({
      leave: (from) => {
        left.current[from] = window.scrollY
      },
      recall: (key) => {
        const top = left.current[key]
        if (top === undefined) return false
        restoreScroll(top)
        return true
      },
    }),
    [],
  )
}
