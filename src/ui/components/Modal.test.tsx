import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

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
    // The reported symptom: dashboard content visible above the sheet, under the
    // clock. The scrim has to cover the whole screen regardless of where the
    // visible band is, or whatever is behind it becomes visible in the gap.
    setViewport({ offsetTop: 120, height: 400, addEventListener: () => {}, removeEventListener: () => {} })
    const { scrim } = renderModal()

    expect(scrim.style.top).toBe('')
    expect(scrim.style.height).toBe('')
    expect(getComputedStyle(scrim).position).toBe('fixed')
  it('closes on a drag past the threshold, the same exit as tapping the backdrop', async () => {
    const onClose = vi.fn()
    drag(openSheet(onClose), 200)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('animates the sheet out from where the finger left it, then unmounts', async () => {
    const onClose = vi.fn()
    const sheet = openSheet(onClose)
    drag(sheet, 200)

    // Still on screen, leaving under its own steam — the abrupt version reset the
    // sheet to rest and unmounted it in the same frame the finger lifted.
    expect(sheet.className).toContain('sheetClosing')
    expect(onClose).not.toHaveBeenCalled()

    const overlay = sheet.parentElement
    expect(overlay?.className).toContain('overlayClosing')
    // Carries on from the release point rather than restarting from the top.
    expect(overlay?.style.getPropertyValue('--sheet-from')).toBe('200px')

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('skips the exit entirely for a viewer who asked for less movement', () => {
    // The animation gates the unmount, so under reduced motion it has to be skipped
    // rather than merely stilled — a zero-length animation would still have to be
    // waited out, and a suppressed one would never finish at all.
    // jsdom ships no matchMedia at all, which is also why every other test here
    // takes the animated path.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const onClose = vi.fn()
    const sheet = openSheet(onClose)

    drag(sheet, 200)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sheet.className).not.toContain('sheetClosing')
    vi.unstubAllGlobals()
  })

  it('hands straight over without animating when the close may be refused', () => {
    // TransactionModal raises a discard confirm instead of closing; a sheet that had
    // animated away would be stranded off-screen behind it.
    const onClose = vi.fn()
    render(
      <Modal title="New transaction" onClose={onClose} closeMayPrompt>
        <p>body</p>
      </Modal>,
    )
    const sheet = screen.getByRole('dialog')
    Object.defineProperty(sheet, 'offsetHeight', { value: 400, configurable: true })
    Object.defineProperty(sheet, 'scrollTop', { value: 0, writable: true })

    drag(sheet, 200)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sheet.className).not.toContain('sheetClosing')
  })

  it('confines the sheet to the visible slice, which is a different box', () => {
    setViewport({ offsetTop: 120, height: 400, addEventListener: () => {}, removeEventListener: () => {} })
    const { band } = renderModal()

    expect(band.style.top).toBe('120px')
    expect(band.style.height).toBe('400px')
    // The sheet lives inside the band, not inside the scrim directly.
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
