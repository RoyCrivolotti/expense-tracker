import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadPageWhenNothingOpen } from './reloadPage'
import {
  holdUpdateReload,
  reloadWhenNothingOpen,
  resetUpdateReloadHoldForTests,
  trackTypingFocus,
  useHoldUpdateReload,
} from './updateReloadHold'

afterEach(resetUpdateReloadHoldForTests)

describe('update reload hold', () => {
  it('reloads at once when nothing is open', () => {
    const reload = vi.fn()
    reloadWhenNothingOpen(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds the reload while a form is open and runs it when that form closes', () => {
    const reload = vi.fn()
    const release = holdUpdateReload()
    reloadWhenNothingOpen(reload)
    expect(reload).not.toHaveBeenCalled()
    release()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stays held while any one of two forms is still open', () => {
    const reload = vi.fn()
    const first = holdUpdateReload()
    const second = holdUpdateReload()
    reloadWhenNothingOpen(reload)
    first()
    expect(reload).not.toHaveBeenCalled()
    second()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('counts a release once, so a double release cannot free another form', () => {
    const reload = vi.fn()
    const first = holdUpdateReload()
    holdUpdateReload()
    reloadWhenNothingOpen(reload)
    first()
    first()
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once however many times it is asked while held', () => {
    const reload = vi.fn()
    const release = holdUpdateReload()
    reloadWhenNothingOpen(reload)
    reloadWhenNothingOpen(reload)
    release()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a mounted component holds it, and unmounting runs it', () => {
    const reload = vi.fn()
    function Form() {
      useHoldUpdateReload()
      return null
    }
    const { unmount } = render(<Form />)
    reloadWhenNothingOpen(reload)
    expect(reload).not.toHaveBeenCalled()
    unmount()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('typing focus', () => {
  let stop: () => void
  beforeEach(() => {
    stop = trackTypingFocus()
  })
  afterEach(() => {
    stop()
    document.body.innerHTML = ''
  })

  function field(html: string): HTMLElement {
    document.body.insertAdjacentHTML('beforeend', html)
    return document.body.lastElementChild as HTMLElement
  }
  const settle = () => Promise.resolve()

  it('holds while a text field has focus and reloads when focus leaves', async () => {
    const reload = vi.fn()
    const input = field('<input type="text" />')
    input.focus()
    reloadWhenNothingOpen(reload)
    expect(reload).not.toHaveBeenCalled()

    input.blur()
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds for a textarea and for contenteditable, and not for a slider, a checkbox or a button', async () => {
    for (const [html, holds] of [
      ['<textarea></textarea>', true],
      ['<div contenteditable="true" tabindex="0"></div>', true],
      ['<input type="range" />', false],
      ['<input type="checkbox" />', false],
      ['<button type="button">Go</button>', false],
    ] as const) {
      const reload = vi.fn()
      const el = field(html)
      el.focus()
      reloadWhenNothingOpen(reload)
      expect(reload).toHaveBeenCalledTimes(holds ? 0 : 1)
      el.blur()
      await settle()
      expect(reload).toHaveBeenCalledTimes(1)
      resetUpdateReloadHoldForTests()
      stop()
      stop = trackTypingFocus()
    }
  })

  it('counts a field inside an open sheet once: the sheet alone keeps it held after blur, and closing frees it', async () => {
    const reload = vi.fn()
    const release = holdUpdateReload()
    const input = field('<input />')
    input.focus()
    reloadWhenNothingOpen(reload)
    input.blur()
    await settle()
    expect(reload).not.toHaveBeenCalled()

    input.focus()
    release()
    expect(reload).not.toHaveBeenCalled()
    input.blur()
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('lets go when the focused field is removed without a blur', () => {
    vi.useFakeTimers()
    try {
      const reload = vi.fn()
      const input = field('<input />')
      input.focus()
      reloadWhenNothingOpen(reload)
      input.remove()
      vi.advanceTimersByTime(1000)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('reloadPageWhenNothingOpen', () => {
  it('reloads the page through the hold, so the worker-replaced path cannot skip a form', () => {
    const reload = vi.fn()
    const location = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, reload } })
    try {
      const release = holdUpdateReload()
      reloadPageWhenNothingOpen()
      expect(reload).not.toHaveBeenCalled()
      release()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location })
    }
  })
})
