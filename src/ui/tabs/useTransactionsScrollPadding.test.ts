import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RESULTS_ANCHOR_ID } from './scrollToResults'
import { useTransactionsScrollPadding } from './useTransactionsScrollPadding'

const root = document.documentElement

/** A sticky block as the browser would have laid it out; jsdom lays nothing out itself. */
function pinned(top: string, height: number, attributes: Record<string, string>) {
  const el = document.createElement('div')
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value)
  el.style.position = 'sticky'
  el.style.top = top
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  document.body.append(el)
  return el
}

const resultBar = () => pinned('56px', 44, { id: RESULTS_ANCHOR_ID })
const dayHeader = () => pinned('100px', 36, { 'data-day-header': '' })

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {}
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  document.body.innerHTML = ''
  root.removeAttribute('style')
  vi.unstubAllGlobals()
})

describe('useTransactionsScrollPadding', () => {
  it('keeps focus clear of the result bar and the day header that sticks under it', () => {
    resultBar()
    dayHeader()

    renderHook(() => useTransactionsScrollPadding(true, false))

    expect(root.style.scrollPaddingTop).toBe('144px')
    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('144px')
  })

  it('counts only the result bar when there are no day headers', () => {
    resultBar()

    renderHook(() => useTransactionsScrollPadding(false, false))

    expect(root.style.scrollPaddingTop).toBe('108px')
  })

  it('measures again when rows come or go, and when picking rows changes the headers', () => {
    resultBar()
    const header = dayHeader()
    const { rerender } = renderHook(
      ({ hasRows, selecting }) => useTransactionsScrollPadding(hasRows, selecting),
      { initialProps: { hasRows: true, selecting: false } },
    )
    expect(root.style.scrollPaddingTop).toBe('144px')

    header.remove()
    rerender({ hasRows: false, selecting: false })
    expect(root.style.scrollPaddingTop).toBe('108px')

    const picking = dayHeader()
    Object.defineProperty(picking, 'offsetHeight', { configurable: true, value: 40 })
    rerender({ hasRows: true, selecting: true })
    expect(root.style.scrollPaddingTop).toBe('148px')
  })

  it('measures again when the bar or a day header changes size', () => {
    const bar = resultBar()
    const header = dayHeader()
    renderHook(() => useTransactionsScrollPadding(true, false))
    const [observer] = FakeResizeObserver.instances

    expect(observer?.observed).toEqual([bar, header])
    Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 52 })
    act(() => observer?.callback())

    expect(root.style.scrollPaddingTop).toBe('160px')
  })

  it('puts the page back to what it was when the list goes', () => {
    resultBar()
    root.style.scrollPaddingTop = '3px'
    const { unmount } = renderHook(() => useTransactionsScrollPadding(false, false))

    unmount()

    expect(root.style.scrollPaddingTop).toBe('3px')
    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('')
  })
})
