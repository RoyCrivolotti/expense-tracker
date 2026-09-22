import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { isBodyScrollLocked } from '../hooks/useBodyScrollLock'
import { EASE_THROWN, exitDurationMs } from '../hooks/useSheetExit'
import { Modal } from './Modal'
import { Presence } from './Presence'

describe('Modal', () => {
  it('sends initial focus to the first focusable control (the header Close button), not the heading', () => {
    render(
      <Modal title="Step one" onClose={vi.fn()}>
        <button type="button">Continue</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('moves focus to the heading when the title changes after mount, so screen readers announce the new step', () => {
    const { rerender } = render(
      <Modal title="Step one" onClose={vi.fn()}>
        <button type="button">Continue</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))

    rerender(
      <Modal title="Step two" onClose={vi.fn()}>
        <button type="button">Continue</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Step two' }))
  })

  it('does not move focus again on a re-render that keeps the same title', () => {
    const { rerender } = render(
      <Modal title="Step one" onClose={vi.fn()}>
        <button type="button">Continue</button>
      </Modal>,
    )
    const continueButton = screen.getByText('Continue')
    continueButton.focus()
    expect(document.activeElement).toBe(continueButton)

    rerender(
      <Modal title="Step one" onClose={vi.fn()}>
        <button type="button">Continue</button>
      </Modal>,
    )
    expect(document.activeElement).toBe(continueButton)
  })
})

describe('Modal — staying inside the visible area', () => {
  const setViewport = (value: unknown) =>
    Object.defineProperty(window, 'visualViewport', { configurable: true, value })

  afterEach(() => setViewport(undefined))

  function renderModal() {
    const { container } = render(
      <Modal title="New transaction" onClose={vi.fn()}>
        <p>body</p>
      </Modal>,
    )
    const scrim = container.querySelector<HTMLElement>('[role="presentation"]')!
    return { scrim, band: scrim.firstElementChild as HTMLElement }
  }

  it('never lets the screen behind show through, even while the viewport is panned', () => {
    setViewport({ offsetTop: 120, height: 400, addEventListener: () => {}, removeEventListener: () => {} })
    const { scrim } = renderModal()

    expect(scrim.style.top).toBe('')
    expect(scrim.style.height).toBe('')
    expect(getComputedStyle(scrim).position).toBe('fixed')
  })

  it('confines the sheet to the visible slice, which is a different box', () => {
    setViewport({ offsetTop: 120, height: 400, addEventListener: () => {}, removeEventListener: () => {} })
    const { band } = renderModal()

    expect(band.style.top).toBe('120px')
    expect(band.style.height).toBe('400px')
    expect(band.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('leaves the CSS fallback alone where the API is unavailable', () => {
    setViewport(undefined)
    const { scrim, band } = renderModal()

    expect(scrim.style.top).toBe('')
    expect(band.style.top).toBe('')
    expect(band.style.height).toBe('')
  })
})

/** jsdom has no TouchEvent constructor; the hook only reads `touches[0]`. */
function touch(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: [{ clientY }] })
  return event
}

function measure(sheet: HTMLElement) {
  Object.defineProperty(sheet, 'offsetHeight', { value: 400, configurable: true })
  Object.defineProperty(sheet, 'scrollTop', { value: 0, writable: true })
}

function drag(sheet: HTMLElement, distance: number) {
  let now = 0
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
  act(() => {
    sheet.dispatchEvent(touch('touchstart', 0))
  })
  act(() => {
    now += 1000
    sheet.dispatchEvent(touch('touchmove', distance))
  })
  act(() => {
    sheet.dispatchEvent(touch('touchend', distance))
  })
  clock.mockRestore()
}

describe('Modal — swipe down to dismiss', () => {
  function openSheet(onClose: () => void) {
    render(
      <Modal title="New transaction" onClose={onClose}>
        <p>body</p>
      </Modal>,
    )
    const sheet = screen.getByRole('dialog')
    measure(sheet)
    return sheet
  }

  it('asks its owner to close on a drag past the threshold, the same as tapping the backdrop', () => {
    const onClose = vi.fn()
    drag(openSheet(onClose), 200)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the drag stops short', () => {
    const onClose = vi.fn()
    drag(openSheet(onClose), 20)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores the gesture while a nested dialog is up', () => {
    const onClose = vi.fn()
    render(
      <Modal title="New transaction" onClose={onClose} trapPaused>
        <p>body</p>
      </Modal>,
    )
    const sheet = screen.getByRole('dialog')
    measure(sheet)

    drag(sheet, 200)

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  /** A stand-in for whatever owns a modal: closes it when asked, or refuses. */
  function Owner({ onClose, accept = true }: { onClose: () => void; accept?: boolean }) {
    const [open, setOpen] = useState(true)
    return (
      <Presence show={open} exitMs={EXIT_MS.sheet}>
        <Modal
          title="New transaction"
          onClose={() => {
            onClose()
            if (accept) setOpen(false)
          }}
        >
          <button type="button" onClick={() => setOpen(false)}>
            Save
          </button>
        </Modal>
      </Presence>
    )
  }

  const overlayOf = (sheet: HTMLElement) => sheet.parentElement!.parentElement!

  it('plays its exit when the owner lets go by a route of its own, such as Save', () => {
    render(<Owner onClose={vi.fn()} />)
    const sheet = screen.getByRole('dialog')
    expect(sheet.className).not.toContain('sheetClosing')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('dialog').className).toContain('sheetClosing')
    expect(overlayOf(sheet).className).toContain('overlayClosing')

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('takes no more taps or keystrokes once it is leaving, so a second Enter cannot save twice', () => {
    render(<Owner onClose={vi.fn()} />)
    const sheet = screen.getByRole('dialog')
    expect(overlayOf(sheet).hasAttribute('inert')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(overlayOf(sheet).hasAttribute('inert')).toBe(true)
  })

  it('leaves over the time its owner keeps it mounted for, and from rest when nothing swiped it', () => {
    render(<Owner onClose={vi.fn()} />)
    const sheet = screen.getByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const overlay = overlayOf(sheet)
    expect(overlay.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.sheet}ms`)
    expect(overlay.style.getPropertyValue('--sheet-from')).toBe('0px')
    expect(overlay.style.getPropertyValue('--exit-ease')).toBe('')
  })

  it('carries a swipe on from where the finger let go, and keeps the scrim where it had got to', () => {
    render(<Owner onClose={vi.fn()} />)
    const sheet = screen.getByRole('dialog')
    measure(sheet)

    drag(sheet, 200)

    const overlay = overlayOf(sheet)
    expect(sheet.className).toContain('sheetClosing')
    expect(overlay.style.getPropertyValue('--sheet-from')).toBe('200px')
    expect(overlay.style.getPropertyValue('--exit-ms')).toBe(`${exitDurationMs(400, 200)}ms`)
    expect(overlay.style.getPropertyValue('--exit-ease')).toBe(EASE_THROWN)
    // Half way down a 0.5 scrim is at 0.25. Read from the finished drag, which is back at
    // zero by now, it would flash to 0.5 for the first frame of the exit.
    expect(overlay.style.getPropertyValue('--scrim')).toBe('0.25')
    // The exit animation owns the transform from here.
    expect(sheet.style.transform).toBe('')
  })

  it('settles back instead of parking when the owner answers the swipe with a confirm', () => {
    const onClose = vi.fn()
    render(<Owner onClose={onClose} accept={false} />)
    const sheet = screen.getByRole('dialog')
    measure(sheet)

    drag(sheet, 200)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sheet.className).not.toContain('sheetClosing')
    expect(sheet.style.transform).toBe('')
    expect(overlayOf(sheet).hasAttribute('inert')).toBe(false)
  })

  it('forgets a swipe its owner refused, so a later Save leaves from rest', () => {
    render(<Owner onClose={vi.fn()} accept={false} />)
    const sheet = screen.getByRole('dialog')
    measure(sheet)
    drag(sheet, 200)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const overlay = overlayOf(sheet)
    expect(sheet.className).toContain('sheetClosing')
    expect(overlay.style.getPropertyValue('--sheet-from')).toBe('0px')
    expect(overlay.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.sheet}ms`)
    expect(overlay.style.getPropertyValue('--exit-ease')).toBe('')
    expect(overlay.style.getPropertyValue('--scrim')).toBe('0.5')
  })

  it('lets the page go the moment the exit starts, not when the sheet unmounts', () => {
    // In the installed app a pinned body shortens the layout viewport, so a lock held
    // through the exit left the bottom bar 62px too high on a screen the fading scrim
    // was already revealing, and it dropped into place a beat after the sheet had gone.
    render(<Owner onClose={vi.fn()} />)
    expect(isBodyScrollLocked()).toBe(true)
    expect(document.body.style.position).toBe('fixed')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('dialog').className).toContain('sheetClosing')
    expect(isBodyScrollLocked()).toBe(false)
    expect(document.body.style.position).toBe('')
  })

  it('keeps the departing sheet in the band it left from when the viewport changes mid-exit', () => {
    // Releasing the lock regrows the layout viewport in the installed app. A band still
    // tracking the viewport would move the sheet 62px partway through its exit.
    const listeners: { resize: Array<() => void>; scroll: Array<() => void> } = { resize: [], scroll: [] }
    const vv = {
      offsetTop: 0,
      height: 812,
      addEventListener: (type: 'resize' | 'scroll', fn: () => void) => listeners[type].push(fn),
      removeEventListener: (type: 'resize' | 'scroll', fn: () => void) => {
        listeners[type] = listeners[type].filter((l) => l !== fn)
      },
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
    try {
      render(<Owner onClose={vi.fn()} />)
      const sheet = screen.getByRole('dialog')
      const band = overlayOf(sheet).firstElementChild as HTMLElement
      expect(band.style.height).toBe('812px')

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      vv.height = 874
      void act(() => [...listeners.resize, ...listeners.scroll].forEach((l) => l()))

      expect(band.style.height).toBe('812px')
    } finally {
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    }
  })

  it('stops answering Escape while it is leaving', () => {
    const onClose = vi.fn()
    render(<Owner onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes at once, without holding anything back, for a viewer who asked for less movement', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    render(<Owner onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })
})
