import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalsMobileView } from './goalsView'
import { ADJUST_STACK_ID } from './scrollToAdjustSection'
import { GOALS_NAV_ID } from './scrollToGoalsContent'
import { usePinnedScrollPadding } from './usePinnedScrollPadding'

/** A sticky block as the browser would have laid it out; jsdom lays nothing out itself. */
function pinned(id: string, top: string, height: number) {
  const el = document.createElement('div')
  el.id = id
  el.style.position = 'sticky'
  el.style.top = top
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  document.body.append(el)
  return el
}

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
  document.body.innerHTML = ''
  root.removeAttribute('style')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('usePinnedScrollPadding', () => {
  it('keeps focus clear of the row and the stack under the header, and of the bottom bar', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    pinned(ADJUST_STACK_ID, '103px', 164)

    renderHook(() => usePinnedScrollPadding('adjust'))

    expect(root.style.scrollPaddingTop).toBe('275px')
    expect(root.style.scrollPaddingBottom).toBe(
      'calc(var(--exp-bottom-bar) + env(safe-area-inset-bottom, 0px) + 0.5rem)',
    )
  })

  it('counts only the row in a view that has no stack, and follows the view as it changes', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    const stack = pinned(ADJUST_STACK_ID, '103px', 164)
    const { rerender } = renderHook(({ view }) => usePinnedScrollPadding(view), {
      initialProps: { view: 'adjust' as GoalsMobileView },
    })
    expect(root.style.scrollPaddingTop).toBe('275px')

    stack.remove()
    rerender({ view: 'chart' })

    expect(root.style.scrollPaddingTop).toBe('112px')
  })

  it('counts only the row when the stack is not pinned, as on a short screen', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    pinned(ADJUST_STACK_ID, '103px', 164).style.position = 'static'

    renderHook(() => usePinnedScrollPadding('adjust'))

    expect(root.style.scrollPaddingTop).toBe('112px')
  })

  it('measures again when the window is resized', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    const stack = pinned(ADJUST_STACK_ID, '103px', 164)
    renderHook(() => usePinnedScrollPadding('adjust'))

    stack.style.position = 'static'
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(root.style.scrollPaddingTop).toBe('112px')
  })

  it('measures again when the row or the stack changes size', () => {
    const row = pinned(GOALS_NAV_ID, '60px', 44)
    const stack = pinned(ADJUST_STACK_ID, '103px', 164)
    renderHook(() => usePinnedScrollPadding('adjust'))
    const [observer] = FakeResizeObserver.instances

    expect(observer?.observed).toEqual([row, stack])
    Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: 196 })
    act(() => observer?.callback())

    expect(root.style.scrollPaddingTop).toBe('307px')
  })

  it('still sets the padding where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    pinned(GOALS_NAV_ID, '60px', 44)

    expect(() => renderHook(() => usePinnedScrollPadding('chart'))).not.toThrow()

    expect(root.style.scrollPaddingTop).toBe('112px')
  })

  it('mirrors the top padding in a custom property the content anchor takes out of its margin', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    pinned(ADJUST_STACK_ID, '103px', 164)

    renderHook(() => usePinnedScrollPadding('adjust'))

    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('275px')
  })

  it('puts back what was there, and stops observing, when it leaves the page', () => {
    pinned(GOALS_NAV_ID, '60px', 44)
    root.style.scrollPaddingTop = '3px'
    root.style.scrollPaddingBottom = '5px'
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => usePinnedScrollPadding('chart'))
    expect(root.style.scrollPaddingTop).toBe('112px')

    unmount()

    expect(root.style.scrollPaddingTop).toBe('3px')
    expect(root.style.scrollPaddingBottom).toBe('5px')
    expect(root.style.getPropertyValue('--scroll-pad-top')).toBe('')
    expect(FakeResizeObserver.instances.every((o) => o.disconnected)).toBe(true)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
