import { vi } from 'vitest'

/**
 * jsdom has no matchMedia. This installs one that answers every query from `matching`, and that
 * lets a test report a query changing, as a window resized across a breakpoint does:
 * `setMatching` changes the answers, without telling anyone listening, and `change` makes one
 * query match, or stop matching, and tells whoever is listening to it. Like a real
 * MediaQueryList, one already handed out answers with what is true now. `listenerCount` is how
 * many are listening to a query, for a test that something stopped.
 */
export function installFakeMatchMedia(matching: (query: string) => boolean = () => false) {
  let current = matching
  const changed = new Map<string, boolean>()
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return changed.get(query) ?? current(query)
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.set(query, (listeners.get(query) ?? new Set()).add(listener))
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.get(query)?.delete(listener)
    },
    dispatchEvent: vi.fn(),
  }))
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: matchMedia })
  return {
    matchMedia,
    setMatching(next: (query: string) => boolean) {
      current = next
      changed.clear()
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0
    },
    change(query: string, matches: boolean) {
      changed.set(query, matches)
      listeners.get(query)?.forEach((listener) => listener({ matches, media: query } as MediaQueryListEvent))
    },
  }
}
