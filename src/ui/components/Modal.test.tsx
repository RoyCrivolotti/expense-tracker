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
