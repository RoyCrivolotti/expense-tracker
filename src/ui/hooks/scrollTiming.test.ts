import { afterEach, describe, expect, it, vi } from 'vitest'
import { afterRender, scrollBehavior } from './scrollTiming'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('afterRender', () => {
  it('waits for the next frame where there is one', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    const run = vi.fn()

    afterRender(run)
    expect(run).not.toHaveBeenCalled()

    frames[0]?.(0)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs at once where there are no frames', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const run = vi.fn()

    afterRender(run)

    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('scrollBehavior', () => {
  it('keeps the behaviour asked for', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))

    expect(scrollBehavior('smooth')).toBe('smooth')
    expect(scrollBehavior('auto')).toBe('auto')
  })

  it('jumps instead of animating when the viewer asked for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion') }))

    expect(scrollBehavior('smooth')).toBe('auto')
  })
})
