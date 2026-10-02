import { useCallback, useSyncExternalStore } from 'react'

function list(query: string): MediaQueryList | null {
  // jsdom has no matchMedia; without it, nothing matches.
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null
}

/**
 * Whether a media query matches, kept in step as it changes. An external store rather than state
 * set from an effect, so a change between render and subscription is not lost and a new `query`
 * is answered on the render that passes it.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mql = list(query)
      mql?.addEventListener('change', notify)
      return () => mql?.removeEventListener('change', notify)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => list(query)?.matches ?? false,
    () => false,
  )
}
