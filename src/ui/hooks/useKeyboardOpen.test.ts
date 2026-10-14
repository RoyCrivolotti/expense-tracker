import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTextEntry, useKeyboardOpen } from './useKeyboardOpen'

type Listener = () => void

const LAYOUT_HEIGHT = 800

function stubViewport(height: number, scale = 1) {
  const listeners: Listener[] = []
  const vv = {
    height,
    scale,
    offsetTop: 0,
    addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_type: string, fn: Listener) => {
      const at = listeners.indexOf(fn)
      if (at >= 0) listeners.splice(at, 1)
    },
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  return {
    vv,
    resize: () => act(() => listeners.forEach((l) => l())),
  }
}

function field(type: string, tag: 'input' | 'textarea' = 'input'): HTMLInputElement | HTMLTextAreaElement {
  const el = document.createElement(tag)
  if (tag === 'input') (el as HTMLInputElement).type = type
  document.body.appendChild(el)
  return el
}

/** Focus, then let the hook's deferred read of the active element run. */
function focusAndSettle(el: HTMLElement) {
  act(() => el.focus())
  act(() => void vi.advanceTimersByTime(0))
}

function blurAndSettle(el: HTMLElement) {
  act(() => el.blur())
  act(() => void vi.advanceTimersByTime(0))
}

const innerHeightBefore = window.innerHeight

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: LAYOUT_HEIGHT })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeightBefore })
})

describe('isTextEntry', () => {
  it('is true for the fields that open a text keyboard', () => {
    for (const type of ['text', 'number', 'search', 'email', 'tel', 'url', 'password']) {
      expect(isTextEntry(field(type))).toBe(true)
    }
    expect(isTextEntry(field('', 'textarea'))).toBe(true)
  })

  it('is false for fields that open a picker or nothing', () => {
    for (const type of ['date', 'month', 'checkbox', 'radio', 'range', 'button', 'file', 'color']) {
      expect(isTextEntry(field(type))).toBe(false)
    }
  })

  it('is false for a read-only field and for nothing at all', () => {
    const ro = field('text') as HTMLInputElement
    ro.readOnly = true
    expect(isTextEntry(ro)).toBe(false)
    const ta = field('', 'textarea') as HTMLTextAreaElement
    ta.readOnly = true
    expect(isTextEntry(ta)).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })

  it('is true for an editable region and false for a plain element', () => {
    const div = document.createElement('div')
    expect(isTextEntry(div)).toBe(false)
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(isTextEntry(div)).toBe(true)
    expect(isTextEntry(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))).toBe(false)
  })
})

describe('useKeyboardOpen', () => {
  it('is closed to begin with', () => {
    stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    expect(result.current).toBe(false)
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false)
  })

  it('opens when a text field has focus and the visible area has shrunk', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const input = field('text')

    vv.height = 500
    resize()
    expect(result.current).toBe(false)

    focusAndSettle(input)
    expect(result.current).toBe(true)
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(true)
  })

  it('opens when focus lands first and the visible area shrinks as the keyboard arrives', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    focusAndSettle(field('number'))
    expect(result.current).toBe(false)

    vv.height = 480
    resize()
    expect(result.current).toBe(true)
  })

  it('stays closed for a focused field with nothing covering the page', () => {
    // A hardware or floating keyboard, or a field focused by script without a tap.
    stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    focusAndSettle(field('text'))
    expect(result.current).toBe(false)
  })

  it('stays closed for a field that does not open a keyboard', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    vv.height = 500
    resize()
    focusAndSettle(field('date'))
    expect(result.current).toBe(false)
  })

  it('ignores a small shortfall that is browser chrome rather than a keyboard', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    focusAndSettle(field('text'))
    vv.height = LAYOUT_HEIGHT - 90
    resize()
    expect(result.current).toBe(false)
  })

  it('ignores a pinch zoom, which shrinks the visible area too', () => {
    const { result } = renderHook(() => useKeyboardOpen())
    stubViewport(LAYOUT_HEIGHT / 2, 2)
    focusAndSettle(field('text'))
    expect(result.current).toBe(false)
  })

  it('closes at once when the keyboard goes and the visible area is whole again', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const input = field('text')
    vv.height = 500
    resize()
    focusAndSettle(input)
    expect(result.current).toBe(true)

    blurAndSettle(input)
    vv.height = LAYOUT_HEIGHT
    resize()
    expect(result.current).toBe(false)
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false)
  })

  it('holds while the keyboard is still leaving, then lets go', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const input = field('text')
    vv.height = 500
    resize()
    focusAndSettle(input)

    blurAndSettle(input)
    expect(result.current).toBe(true)
    act(() => void vi.advanceTimersByTime(349))
    expect(result.current).toBe(true)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('is not held for good when iOS leaves the visible area short after the keyboard', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const input = field('text')
    vv.height = 500
    resize()
    focusAndSettle(input)
    blurAndSettle(input)
    resize()
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current).toBe(false)
  })

  it('does not blink while focus moves from one field to the next', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const first = field('text')
    const second = field('number')
    vv.height = 500
    resize()
    focusAndSettle(first)
    expect(result.current).toBe(true)

    act(() => second.focus())
    act(() => void vi.advanceTimersByTime(0))
    expect(result.current).toBe(true)
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)
  })

  it('cancels a pending release when focus comes back', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result } = renderHook(() => useKeyboardOpen())
    const input = field('text')
    vv.height = 500
    resize()
    focusAndSettle(input)
    blurAndSettle(input)
    focusAndSettle(input)
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)
  })

  it('removes the attribute and its listeners on unmount', () => {
    const { vv, resize } = stubViewport(LAYOUT_HEIGHT)
    const { result, unmount } = renderHook(() => useKeyboardOpen())
    const input = field('text')
    vv.height = 500
    resize()
    focusAndSettle(input)
    expect(result.current).toBe(true)

    unmount()
    expect(document.documentElement.hasAttribute('data-keyboard-open')).toBe(false)
    act(() => input.blur())
    act(() => void vi.advanceTimersByTime(1000))
  })

  it('stays closed where there is no visualViewport', () => {
    const { result } = renderHook(() => useKeyboardOpen())
    focusAndSettle(field('text'))
    expect(result.current).toBe(false)
  })
})
