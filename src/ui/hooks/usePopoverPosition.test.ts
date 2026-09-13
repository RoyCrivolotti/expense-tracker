import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { usePopoverPosition } from './usePopoverPosition'

function elementWithRect(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, ...rect }) as DOMRect
  return el
}

/**
 * Gives the next <div> the hook creates — its safe-area probe — a real height,
 * which is the only thing the hook reads the inset from.
 */
function withSafeAreaInset(inset: number, run: () => void) {
  const realCreate = document.createElement.bind(document)
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag)
    if (tag === 'div') {
      el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: inset }) as DOMRect
    }
    return el
  })
  try {
    run()
  } finally {
    spy.mockRestore()
  }
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

    expect(pos).toMatchObject({ top: 134, left: 20 })
  })

  it('flips above the trigger when there is not enough room below', () => {
    const pos = positionFor({ top: 700, bottom: 730, left: 20 }, { width: 200, height: 150 })

    expect(pos).toMatchObject({ top: 546, left: 20 })
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

    expect(pos).toMatchObject({ top: 134, left: 20 })
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
    expect(result.current).toMatchObject({ top: 734, left: 20 })

    popover.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 200, height: 300 }) as DOMRect
    act(() => resizeObservers.at(-1)?.trigger())

    // 300px does not, so it flips above instead of hanging off the bottom.
    expect(result.current).toMatchObject({ top: 396, left: 20 })
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
      expect(pos).toMatchObject({ top: 186, left: 20 })
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })

  it('keeps a popover that fits neither way below the notch', () => {
    // jsdom resolves no env(), so the inset is injected by stubbing the probe
    // element the hook measures.
    withSafeAreaInset(47, () => {
      const pos = positionFor({ top: 700, bottom: 730, left: 20 }, { width: 200, height: 900 })
      expect(pos?.top).toBe(55)
    })
  })

  it('measures the inset from a probe element, not from a custom property', () => {
    // The app's own chrome clears the status bar, but a portalled fixed popover
    // is placed in raw viewport coordinates and will render under the clock
    // unless it is told not to. Reading a custom property holding env() is not
    // a reliable way to learn that: it yields a token stream, and WebKit does
    // not always resolve env() there. A hidden element whose *height* is the
    // inset can only ever report a used value.
    withSafeAreaInset(59, () => {
      const pos = positionFor({ top: 10, bottom: 20, left: 20 }, { width: 200, height: 2000 })
      // 8px edge + 59px inset: below the Dynamic Island, not merely on screen.
      expect(pos?.top).toBe(67)
    })
  })

  it('removes the probe when the popover closes', () => {
    const triggerRef = { current: elementWithRect({ top: 100, bottom: 130, left: 20 }) }
    const popoverRef = { current: elementWithRect({ width: 200, height: 100 }) }
    const probes = () =>
      document.body.querySelectorAll('[data-safe-area-probe]').length

    const { unmount } = renderHook(() => usePopoverPosition(triggerRef, popoverRef))
    expect(probes()).toBe(1)
    unmount()

    // A probe per opened popover, left behind, would accumulate for the life of
    // the page.
    expect(probes()).toBe(0)
  })

  it('caps a tall popover to the visible band rather than letting it overflow', () => {
    // 800 tall viewport, 8px edge, 8px minTop → 784 of usable band.
    const pos = positionFor({ top: 20, bottom: 50, left: 20 }, { width: 200, height: 2000 })
    expect(pos?.maxHeight).toBe(784)
    // 784 still does not fit below a trigger at y=50 in an 800 viewport, and
    // cannot fit above it either, so it pins to the top of the band and scrolls
    // inside itself — rather than running 1200px off the bottom of the screen.
    expect(pos?.top).toBe(8)
  })

  it('never caps the popover below a usable minimum', () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 400, height: 60, offsetTop: 0, offsetLeft: 0, addEventListener: () => {}, removeEventListener: () => {} },
    })
    try {
      // A sliver of popover is worse than one that overflows and can scroll.
      const pos = positionFor({ top: 20, bottom: 50, left: 20 }, { width: 200, height: 300 })
      expect(pos?.maxHeight).toBe(140)
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })

  it('measures the band from offsetTop, not from a bare viewport height', () => {
    // The bug behind the vanishing popover: iOS scrolls the focused field into
    // view when the keyboard opens, so the visual viewport sits *inside* the
    // layout viewport at an offset. getBoundingClientRect reports layout
    // coordinates, so the band has to be expressed in the same ones.
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 400, height: 400, offsetTop: 300, offsetLeft: 0, addEventListener: () => {}, removeEventListener: () => {} },
    })
    try {
      const pos = positionFor({ top: 620, bottom: 650, left: 20 }, { width: 200, height: 150 })
      // Band is 300..700. Below would be 654 and 654+150 overflows it, so it
      // flips above to 620-4-150 = 466 — inside the band, where it can actually
      // be seen. Measuring against a bare height of 400 would have compared it
      // to a band of 0..400 and placed it somewhere nobody can see.
      expect(pos?.top).toBe(466)
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })
})

describe('usePopoverPosition — when the keyboard hides the trigger', () => {
  function withViewport(height: number, offsetTop: number, run: () => void) {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { width: 400, height, offsetTop, offsetLeft: 0, addEventListener: () => {}, removeEventListener: () => {} },
    })
    try {
      run()
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  }

  it('sits as near a keyboard-hidden trigger as the band allows, not at the top', () => {
    // A Flag field low in a long form sits *below* the keyboard, so anchoring to
    // it would put the popover under the keyboard too — but pinning to the top
    // of the screen instead leaves it stranded a long way from the field, which
    // is what the previous attempt did for every input: its expression,
    // `max(minTop, min(bandBottom - height, minTop))`, collapses to minTop.
    withViewport(424, 0, () => {
      const pos = positionFor({ top: 717, bottom: 752, left: 20 }, { width: 200, height: 210 })

      expect(pos?.top).toBe(206)
      // Bottom flush with the band, i.e. as close to the hidden trigger below
      // as it can get — and emphatically not parked at minTop.
      expect(pos!.top + 210).toBe(416)
      expect(pos?.top).not.toBe(8)
    })
  })

  it('still anchors normally once the trigger is inside the band', () => {
    withViewport(424, 0, () => {
      const pos = positionFor({ top: 100, bottom: 130, left: 20 }, { width: 200, height: 150 })
      expect(pos?.top).toBe(134)
    })
  })

  it('treats a trigger scrolled above the band the same way', () => {
    withViewport(400, 300, () => {
      // Band is 300..700; the trigger is at 40, off the top.
      const pos = positionFor({ top: 40, bottom: 70, left: 20 }, { width: 200, height: 150 })
      expect(pos?.top).toBe(308)
    })
  })
})
