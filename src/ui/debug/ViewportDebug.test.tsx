import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewportDebug } from './ViewportDebug'

type Listener = () => void

function stubViewport(offsetTop: number, height: number) {
  const listeners: { resize: Listener[]; scroll: Listener[] } = { resize: [], scroll: [] }
  const vv = {
    offsetTop,
    offsetLeft: 0,
    height,
    width: 390,
    pageTop: offsetTop,
    addEventListener: (type: 'resize' | 'scroll', fn: Listener) => listeners[type].push(fn),
    removeEventListener: (type: 'resize' | 'scroll', fn: Listener) => {
      listeners[type] = listeners[type].filter((l) => l !== fn)
    },
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  return {
    vv,
    fire: () => act(() => listeners.resize.forEach((l) => l())),
    listenerCount: () => listeners.resize.length + listeners.scroll.length,
  }
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  vi.useRealTimers()
})

describe('ViewportDebug', () => {
  it('leads with the verdict, which is the number the panel exists for', () => {
    stubViewport(120, 424)
    render(<ViewportDebug />)
    expect(screen.getByText(/LAYOUT-relative rects/)).toBeInTheDocument()
  })

  it('reports the raw viewport numbers and the tracked rects', () => {
    stubViewport(120, 424)
    render(<ViewportDebug />)
    const panel = screen.getByText(/LAYOUT-relative/).parentElement
    expect(panel?.textContent).toContain('top 120 h 424')
    expect(panel?.textContent).toContain('fixed rect.top')
    expect(panel?.textContent).toContain('overlay')
  })

  it('re-samples when the viewport changes', () => {
    const { vv, fire } = stubViewport(0, 844)
    render(<ViewportDebug />)
    expect(screen.getByText(/no pan yet/)).toBeInTheDocument()

    vv.offsetTop = 120
    vv.height = 424
    fire()

    expect(screen.getByText(/LAYOUT-relative rects \(pan 120/)).toBeInTheDocument()
  })

  it('keeps polling, because iOS reports a stale offsetTop inside the resize handler', () => {
    vi.useFakeTimers()
    const { vv } = stubViewport(0, 844)
    render(<ViewportDebug />)

    // No event fired — only the interval should pick this up.
    vv.offsetTop = 200
    vv.height = 400
    act(() => void vi.advanceTimersByTime(500))

    expect(screen.getByText(/pan 200/)).toBeInTheDocument()
  })

  it('unsubscribes and stops polling on unmount', () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(window, 'clearInterval')
    const { listenerCount } = stubViewport(0, 844)
    const { unmount } = render(<ViewportDebug />)
    expect(listenerCount()).toBe(2)

    unmount()

    expect(listenerCount()).toBe(0)
    expect(clear).toHaveBeenCalled()
  })

  it('renders without a visualViewport rather than crashing the app it is debugging', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    render(<ViewportDebug />)
    expect(screen.getByText(/unavailable/)).toBeInTheDocument()
  })
})
