import { vi } from 'vitest'

/**
 * jsdom has no IntersectionObserver. This stands in for it and lets a test say how much of the
 * observed element is on screen: `emit(0.5)` reports half of it, to every live observer, or to
 * the one at `index` among the live ones.
 */
export interface FakeObserver {
  callback: IntersectionObserverCallback
  options: IntersectionObserverInit | undefined
  targets: Element[]
  disconnected: boolean
}

export function installFakeIntersectionObserver() {
  const observers: FakeObserver[] = []
  class Fake {
    private readonly record: FakeObserver
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = { callback, options, targets: [], disconnected: false }
      observers.push(this.record)
    }
    observe(target: Element) {
      this.record.targets.push(target)
    }
    disconnect() {
      this.record.disconnected = true
      this.record.targets = []
    }
    unobserve() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', Fake)
  const live = () => observers.filter((o) => !o.disconnected)
  return {
    observers,
    live,
    emit(ratio: number, index?: number) {
      const targets = index === undefined ? live() : [live()[index]!]
      for (const o of targets) {
        o.callback(
          [{ intersectionRatio: ratio, isIntersecting: ratio > 0, target: o.targets[0] } as unknown as IntersectionObserverEntry],
          {} as IntersectionObserver,
        )
      }
    },
  }
}
