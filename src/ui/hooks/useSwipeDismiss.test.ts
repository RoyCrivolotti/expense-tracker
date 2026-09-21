import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHEET_GRAB_ATTR, useSwipeDismiss } from './useSwipeDismiss'
import { dismissThresholdPx } from './sheetDismissSnap'

const SHEET_HEIGHT = 400
const THRESHOLD = dismissThresholdPx(SHEET_HEIGHT)

/** jsdom has no TouchEvent constructor, and the hook only ever reads `touches[0]`. */
function touch(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: [{ clientY }] })
  return event
}

let now = 0

function setup({ scrollTop = 0, enabled = true } = {}) {
  const sheet = document.createElement('div')
  const handle = document.createElement('div')
  handle.setAttribute(SHEET_GRAB_ATTR, '')
  const body = document.createElement('div')
  sheet.append(handle, body)
  document.body.appendChild(sheet)
  Object.defineProperty(sheet, 'scrollTop', { value: scrollTop, writable: true })
  Object.defineProperty(sheet, 'offsetHeight', { value: SHEET_HEIGHT, configurable: true })

  const onDismiss = vi.fn()
  const view = renderHook(() => useSwipeDismiss({ current: sheet }, onDismiss, enabled))
  return { sheet, handle, body, onDismiss, view }
}

/**
 * Slow enough that the distance decides the outcome rather than the fling escape:
 * `resolveDismissSnap` dismisses anything faster than 0.35 px/ms whatever the
 * distance, so a "stopped short" drag has to be a deliberate one.
 */
const DELIBERATE_MS = 1000

/** Press at y=0, move through each waypoint `ms` apart, lift at the last one. */
function dragVia(from: Element, waypoints: number[], ms = DELIBERATE_MS) {
  act(() => {
    from.dispatchEvent(touch('touchstart', 0))
  })
  for (const y of waypoints) {
    act(() => {
      now += ms
      from.dispatchEvent(touch('touchmove', y))
    })
  }
  act(() => {
    from.dispatchEvent(touch('touchend', waypoints[waypoints.length - 1] ?? 0))
  })
}

/** Press at y=0 on `from`, move to `distance`, lift. `ms` sets the drag's velocity. */
function drag(from: Element, distance: number, ms = DELIBERATE_MS) {
  act(() => {
    from.dispatchEvent(touch('touchstart', 0))
  })
  act(() => {
    now += ms
    from.dispatchEvent(touch('touchmove', distance))
  })
  act(() => {
    from.dispatchEvent(touch('touchend', distance))
  })
}

describe('useSwipeDismiss', () => {
  beforeEach(() => {
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('dismisses a drag that starts with the sheet already at its top', () => {
    const { body, onDismiss } = setup()

    drag(body, THRESHOLD + 20)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('settles back without dismissing when the drag stops short', () => {
    const { body, onDismiss, view } = setup()

    drag(body, THRESHOLD - 20)

    expect(onDismiss).not.toHaveBeenCalled()
    expect(view.result.current.offset).toBe(0)
  })

  it('dismisses on a quick flick that stops short of the threshold', () => {
    const { body, onDismiss } = setup()

    drag(body, THRESHOLD - 20, 50)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('leaves the gesture alone when the sheet is scrolled down', () => {
    // The drag is a scroll, and stays a scroll for the whole sequence — the decision
    // is latched at touchstart so a gesture never changes meaning halfway through.
    const { body, onDismiss, view } = setup({ scrollTop: 120 })

    drag(body, THRESHOLD + 200)

    expect(onDismiss).not.toHaveBeenCalled()
    expect(view.result.current.offset).toBe(0)
  })

  it('still dismisses from the grab handle while the body is scrolled down', () => {
    const { handle, onDismiss } = setup({ scrollTop: 120 })

    drag(handle, THRESHOLD + 20)

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('tracks the finger while dragging and clamps an upward drag to zero', () => {
    const { body, view } = setup()

    act(() => {
      body.dispatchEvent(touch('touchstart', 0))
    })
    act(() => {
      now += 100
      body.dispatchEvent(touch('touchmove', 60))
    })
    expect(view.result.current.offset).toBe(60)
    expect(view.result.current.isDragging).toBe(true)

    act(() => {
      now += 100
      body.dispatchEvent(touch('touchmove', -80))
    })
    expect(view.result.current.offset).toBe(0)
  })

  it('cancels the dismissal when the finger pulls back up before lifting', () => {
    // Reported from the device: drag well past the threshold, think better of it,
    // come back up, lift below the threshold — and it still closed.
    const { body, onDismiss, view } = setup()

    dragVia(body, [THRESHOLD + 120, 50], 60)

    expect(onDismiss).not.toHaveBeenCalled()
    expect(view.result.current.offset).toBe(0)
  })

  it('hands the release offset to the caller so the exit can carry on from there', () => {
    const { body, onDismiss } = setup()

    drag(body, THRESHOLD + 60)

    expect(onDismiss).toHaveBeenCalledWith(THRESHOLD + 60)
  })

  it('lets the sheet go once it has said where, so a refused close settles instead of parking', () => {
    const { body, onDismiss, view } = setup()

    drag(body, THRESHOLD + 60)

    // The caller has the release offset to continue from. The sheet itself is released:
    // if the owner closes, its exit takes over the transform, and if it raises a confirm
    // instead the sheet does not stay displaced under it.
    expect(onDismiss).toHaveBeenCalledWith(THRESHOLD + 60)
    expect(view.result.current.offset).toBe(0)
    expect(view.result.current.progress).toBe(0)
    expect(view.result.current.isDragging).toBe(false)
  })

  it('reports progress against the sheet height, for fading the scrim', () => {
    const { body, view } = setup()

    act(() => {
      body.dispatchEvent(touch('touchstart', 0))
    })
    act(() => {
      now += 100
      body.dispatchEvent(touch('touchmove', SHEET_HEIGHT / 2))
    })

    expect(view.result.current.progress).toBeCloseTo(0.5, 5)
  })

  it('does nothing at all while disabled', () => {
    const { body, onDismiss } = setup({ enabled: false })

    drag(body, THRESHOLD + 200)

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('ignores a tap with sub-threshold finger wobble', () => {
    const { body, onDismiss, view } = setup()

    act(() => {
      body.dispatchEvent(touch('touchstart', 0))
    })
    act(() => {
      now += 50
      body.dispatchEvent(touch('touchmove', 5))
    })
    expect(view.result.current.isDragging).toBe(false)
    expect(view.result.current.offset).toBe(0)

    act(() => {
      body.dispatchEvent(touch('touchend', 5))
    })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(view.result.current.isDragging).toBe(false)
  })

  it('does not preventDefault during the dead zone, so taps reach form fields', () => {
    const { body } = setup()

    act(() => {
      body.dispatchEvent(touch('touchstart', 0))
    })
    const moveEvent = touch('touchmove', 5)
    act(() => {
      now += 50
      body.dispatchEvent(moveEvent)
    })
    expect(moveEvent.defaultPrevented).toBe(false)
  })

  it('commits to the drag once past the dead zone threshold', () => {
    const { body, view } = setup()

    act(() => {
      body.dispatchEvent(touch('touchstart', 0))
    })
    expect(view.result.current.isDragging).toBe(false)

    act(() => {
      now += 50
      body.dispatchEvent(touch('touchmove', 12))
    })
    expect(view.result.current.isDragging).toBe(true)
    expect(view.result.current.offset).toBe(12)
  })
})
