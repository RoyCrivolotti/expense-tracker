import { renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
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
