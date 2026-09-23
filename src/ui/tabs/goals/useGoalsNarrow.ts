import { useEffect, useState } from 'react'

/** Below this the Goals tab stacks into one column and charts show one at a time. */
export const NARROW_MQ = '(max-width: 899px)'

function query(): MediaQueryList | null {
  // jsdom has no matchMedia; without it, assume the wide layout.
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_MQ)
    : null
}

export function useGoalsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => query()?.matches ?? false)
  useEffect(() => {
    const mql = query()
    if (!mql) return
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return narrow
}
