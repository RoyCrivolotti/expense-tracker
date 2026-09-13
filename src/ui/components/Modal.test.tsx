import { render, screen } from '@testing-library/react'
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

  it('offsets the overlay to the visible slice when a keyboard pans the screen', () => {
    // position: fixed pins to the *layout* viewport, which iOS does not move for
    // a keyboard — it pans a smaller visual one inside it. Without following
    // that, the sheet's header slides underneath the status bar.
    setViewport({ offsetTop: 120, height: 400, addEventListener: () => {}, removeEventListener: () => {} })
    const { container } = render(
      <Modal title="New transaction" onClose={vi.fn()}>
        <p>body</p>
      </Modal>,
    )

    const overlay = container.querySelector<HTMLElement>('[role="presentation"]')
    expect(overlay?.style.top).toBe('120px')
    expect(overlay?.style.height).toBe('400px')
  })

  it('leaves the CSS fallback alone where the API is unavailable', () => {
    setViewport(undefined)
    const { container } = render(
      <Modal title="New transaction" onClose={vi.fn()}>
        <p>body</p>
      </Modal>,
    )

    const overlay = container.querySelector<HTMLElement>('[role="presentation"]')
    expect(overlay?.style.top).toBe('')
    expect(overlay?.style.height).toBe('')
  })
})
