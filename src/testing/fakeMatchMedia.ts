import { vi } from 'vitest'

/**
 * jsdom has no matchMedia. This installs one that answers every query from `matching`, and that
 * lets a test report a query changing, as a window resized across a breakpoint does:
 * `setMatching` changes the answers for queries made from then on, and `change` tells whoever
 * is listening to one query that it now matches, or no longer does.
 */
export function installFakeMatchMedia(matching: (query: string) => boolean = () => false) {
  let current = matching
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  const matchMedia = vi.fn((query: string) => ({
    matches: current(query),
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
    },
    change(query: string, matches: boolean) {
      listeners.get(query)?.forEach((listener) => listener({ matches, media: query } as MediaQueryListEvent))
    },
  }
}
