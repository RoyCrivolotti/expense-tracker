import { vi } from 'vitest'

/**
 * jsdom lays nothing out, so `useTooltipSide`'s bar probes (each a `visibility:hidden` div,
 * measured for its own height) would all read zero. This gives them a fixed height instead, so
 * `visibleBand`'s header/tab-bar math has something real to work with; every other element still
 * measures as a zero-sized rect until a test overrides it for its own scene.
 */
export function installFakeBars(barHeight = 60) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return (this.style.visibility === 'hidden'
      ? { top: 0, bottom: barHeight, height: barHeight }
      : { top: 0, bottom: 0, height: 0 }) as DOMRect
  })
}
