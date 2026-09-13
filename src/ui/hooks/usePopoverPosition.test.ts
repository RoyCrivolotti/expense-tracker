import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { usePopoverPosition } from './usePopoverPosition'

function elementWithRect(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, ...rect }) as DOMRect
  return el
}

function positionFor(trigger: Partial<DOMRect>, popover: Partial<DOMRect>) {
  const triggerRef = { current: elementWithRect(trigger) }
  const popoverRef = { current: elementWithRect(popover) }
  return renderHook(() => usePopoverPosition(triggerRef, popoverRef)).result.current
}

describe('usePopoverPosition', () => {
  beforeEach(() => {
    window.innerWidth = 400
    window.innerHeight = 800
  })

  it('places the popover just below the trigger when there is room', () => {
    const pos = positionFor({ top: 100, bottom: 130, left: 20 }, { width: 200, height: 150 })

    expect(pos).toEqual({ top: 134, left: 20 })
  })

  it('flips above the trigger when there is not enough room below', () => {
    const pos = positionFor({ top: 700, bottom: 730, left: 20 }, { width: 200, height: 150 })

    expect(pos).toEqual({ top: 546, left: 20 })
  })

  it('clamps a flipped popover to the top of the viewport', () => {
    // A tall popover on a trigger near the top would otherwise be placed at a
    // negative offset and render off-screen.
    const pos = positionFor({ top: 20, bottom: 50, left: 20 }, { width: 200, height: 900 })

    expect(pos?.top).toBe(8)
  })

  it('pulls the popover back inside the right edge', () => {
    const pos = positionFor({ top: 100, bottom: 130, left: 350 }, { width: 200, height: 100 })

    expect(pos?.left).toBe(192)
  })

  it('keeps a minimum gap from the left edge', () => {
    const pos = positionFor({ top: 100, bottom: 130, left: -40 }, { width: 200, height: 100 })

    expect(pos?.left).toBe(8)
  })

  it('ignores page scroll, because the popover is positioned fixed', () => {
    // Regression: adding window.scrollY here put the popover hundreds of pixels
    // off-screen inside a Modal, where useBodyScrollLock pins <body> with
    // `position: fixed; top: -<scrollY>px` and scrollY itself reads 0.
    Object.defineProperty(window, 'scrollY', { value: 700, configurable: true })
    const pos = positionFor({ top: 100, bottom: 130, left: 20 }, { width: 200, height: 150 })

    expect(pos).toEqual({ top: 134, left: 20 })
  })
})

describe('usePopoverPosition — repositioning after it opens', () => {
  beforeEach(() => {
    window.innerWidth = 400
    window.innerHeight = 800
  })

  it('re-places the popover when it grows, not just when the window changes', () => {
    // The flag picker revealing its "new flag" input: the popover gets taller
    // after it has already been positioned. Keeping the old placement is what
    // pushed it off the bottom of the screen.
    const trigger = elementWithRect({ top: 700, bottom: 730, left: 20 })
    const popover = elementWithRect({ width: 200, height: 50 })
    const triggerRef = { current: trigger }
    const popoverRef = { current: popover }

    const { result } = renderHook(() => usePopoverPosition(triggerRef, popoverRef))
    // 50px tall fits in the 70px below the trigger.
    expect(result.current).toEqual({ top: 734, left: 20 })

    popover.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 200, height: 300 }) as DOMRect
    act(() => resizeObservers.at(-1)?.trigger())

    // 300px does not, so it flips above instead of hanging off the bottom.
    expect(result.current).toEqual({ top: 396, left: 20 })
  })

  it('observes the popover itself, which is the element that changes size', () => {
    const triggerRef = { current: elementWithRect({ top: 100, bottom: 130, left: 20 }) }
    const popoverRef = { current: elementWithRect({ width: 200, height: 100 }) }

    renderHook(() => usePopoverPosition(triggerRef, popoverRef))
    expect(resizeObservers.at(-1)?.target).toBe(popoverRef.current)
  })

  it('stops observing on unmount, so a closed popover cannot reposition', () => {
    const triggerRef = { current: elementWithRect({ top: 100, bottom: 130, left: 20 }) }
    const popoverRef = { current: elementWithRect({ width: 200, height: 100 }) }

    const { unmount } = renderHook(() => usePopoverPosition(triggerRef, popoverRef))
    expect(resizeObservers).toHaveLength(1)
    unmount()
    expect(resizeObservers).toHaveLength(0)
  })

  it('measures the visual viewport, so an open keyboard counts as lost room', () => {
    // window.innerHeight does not move when iOS opens the keyboard. Trusting it
    // made every popover near the bottom of a form believe it had room to open
    // downwards into space the keyboard was covering.
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 400, height: 400, addEventListener: () => {}, removeEventListener: () => {} },
    })
    try {
      const pos = positionFor({ top: 340, bottom: 370, left: 20 }, { width: 200, height: 150 })
      // 400 - 370 - 4 = 26px below, so it flips rather than opening under the keyboard.
      expect(pos).toEqual({ top: 186, left: 20 })
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })

  it('keeps a flipped popover below the notch, not merely on screen', () => {
    document.documentElement.style.setProperty('--exp-safe-top', '47px')
    try {
      const pos = positionFor({ top: 20, bottom: 50, left: 20 }, { width: 200, height: 900 })
      // 8px would put it under the clock on a notched phone.
      expect(pos?.top).toBe(55)
    } finally {
      document.documentElement.style.removeProperty('--exp-safe-top')
    }
  })
})
