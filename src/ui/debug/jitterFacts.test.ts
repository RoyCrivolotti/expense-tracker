import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeEnvironment, startFactsSampler } from './jitterFacts'

describe('jitter facts', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says whether the page runs as a home-screen app and which Safari it is', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
    )
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })

    const text = describeEnvironment()

    expect(text).toContain('home-screen app')
    expect(text).toContain('18_6')
    expect(text).toContain('26.0')
    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
  })

  it('keeps the range of each number seen while the page scrolls and can clear it', () => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    const sampler = startFactsSampler()
    Object.defineProperty(window, 'scrollY', { value: 340, configurable: true })
    vi.advanceTimersByTime(200)

    expect(sampler.report()).toContain('scrollY   120 to 340')

    sampler.reset()
    expect(sampler.report()).toContain('scrollY   340')
    sampler.stop()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })

  it('leaves no probe elements behind once stopped', () => {
    const before = document.body.children.length
    const sampler = startFactsSampler()
    expect(document.body.children.length).toBe(before + 2)

    sampler.stop()
    expect(document.body.children.length).toBe(before)
  })

  it('follows the visual viewport too, which shrinks when the browser toolbar grows', () => {
    const viewport = { height: 664, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
    const sampler = startFactsSampler()
    viewport.height = 750
    vi.useFakeTimers()

    expect(sampler.report()).toContain('vv h      664 to 750')
    expect(viewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))

    sampler.stop()
    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
  })
})
