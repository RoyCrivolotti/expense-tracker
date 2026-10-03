import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackScrollPadding } from './scrollPadding'

const root = document.documentElement

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnected = false
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {
    this.disconnected = true
  }
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  root.removeAttribute('style')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('trackScrollPadding', () => {
  it('sets the top padding, and the custom property that takes it back out of a scroll margin', () => {
    const stop = trackScrollPadding({ top: () => 112, watch: () => [] })

    expect(root.style.scrollPaddingTop).toBe('112px')
    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('112px')
    stop()
  })

  it('leaves the bottom padding to the stylesheet', () => {
    const stop = trackScrollPadding({ top: () => 112, watch: () => [] })

    expect(root.style.scrollPaddingBottom).toBe('')
    stop()
  })

  it('measures again when the window is resized, and when something it watches changes size', () => {
    let top = 112
    const watched = document.createElement('div')
    const stop = trackScrollPadding({ top: () => top, watch: () => [watched, null] })
    const [observer] = FakeResizeObserver.instances
    expect(observer?.observed).toEqual([watched])

    top = 150
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(root.style.scrollPaddingTop).toBe('150px')

    top = 196
    act(() => observer?.callback())
    expect(root.style.scrollPaddingTop).toBe('196px')
    stop()
  })

  it('still sets the padding where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)

    const stop = trackScrollPadding({ top: () => 112, watch: () => [document.createElement('div')] })

    expect(root.style.scrollPaddingTop).toBe('112px')
    stop()
  })

  it('puts back what was there, and stops listening, when it is stopped', () => {
    root.style.scrollPaddingTop = '3px'
    root.style.setProperty('--scroll-pad-top', '7px')
    const remove = vi.spyOn(window, 'removeEventListener')
    const stop = trackScrollPadding({ top: () => 112, watch: () => [] })

    stop()

    expect(root.style.scrollPaddingTop).toBe('3px')
    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('7px')
    expect(FakeResizeObserver.instances.every((o) => o.disconnected)).toBe(true)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('takes the custom property away again when there was none', () => {
    const stop = trackScrollPadding({ top: () => 112, watch: () => [] })

    stop()

    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('')
  })
})
