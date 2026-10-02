import { useEffect, useState } from 'react'

function list(query: string): MediaQueryList | null {
  // jsdom has no matchMedia; without it, nothing matches.
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null
}

/** Whether a media query matches, kept in step as it changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => list(query)?.matches ?? false)
  useEffect(() => {
    const mql = list(query)
    if (!mql) return
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
