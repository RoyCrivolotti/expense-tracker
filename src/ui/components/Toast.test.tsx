import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { ToastViewport, type ToastItem } from './Toast'
import { UNDO_SHORTCUT } from './toastShortcuts'

const toast: ToastItem = { id: 1, message: 'Transaction deleted', tone: 'success' }

beforeEach(() => {
  vi.useFakeTimers()
  setMotionDisabledForTests(false)
})
afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
})

describe('ToastViewport', () => {
  it('shows the message, and nothing when there is none', () => {
    const { rerender } = render(<ToastViewport toast={null} onDismiss={vi.fn()} />)
    expect(screen.queryByRole('status')).toBeNull()

    rerender(<ToastViewport toast={toast} onDismiss={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe('Transaction deleted')
  })

  it('fades out with its words still in it, then goes', () => {
    const { rerender } = render(<ToastViewport toast={toast} onDismiss={vi.fn()} />)

    rerender(<ToastViewport toast={null} onDismiss={vi.fn()} />)

    const bubble = screen.getByText('Transaction deleted')
    expect(bubble.className).toContain('leaving')
    expect(bubble.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.fade}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.fade))
    expect(screen.queryByText('Transaction deleted')).toBeNull()
  })

  it('goes at once for a viewer who asked for less movement', () => {
    setMotionDisabledForTests(true)
    const { rerender } = render(<ToastViewport toast={toast} onDismiss={vi.fn()} />)

    rerender(<ToastViewport toast={null} onDismiss={vi.fn()} />)

    expect(screen.queryByText('Transaction deleted')).toBeNull()
  })

  it('carries a button that does what it offers and takes the toast away, without a second dismissal from the tap', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    render(<ToastViewport toast={{ ...toast, action: { label: 'Undo', onAction } }} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses a toast with a button on a tap beside the button, without running it', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    render(<ToastViewport toast={{ ...toast, action: { label: 'Undo', onAction } }} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('Transaction deleted'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('has no button unless it was given one', () => {
    render(<ToastViewport toast={toast} onDismiss={vi.fn()} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is dismissed by a tap while it is showing', () => {
    const onDismiss = vi.fn()
    render(<ToastViewport toast={toast} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByText('Transaction deleted'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  describe('with a shortcut for its button', () => {
    const withShortcut = (onAction = vi.fn()): ToastItem => ({
      ...toast,
      action: { label: 'Undo', onAction, shortcut: UNDO_SHORTCUT },
    })
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      document.dispatchEvent(event)
      return event
    }

    it('runs the button on Alt+Z, takes the toast away, and keeps the key from typing a letter', () => {
      const onAction = vi.fn()
      const onDismiss = vi.fn()
      render(<ToastViewport toast={withShortcut(onAction)} onDismiss={onDismiss} />)

      const event = press({ code: 'KeyZ', key: 'Ω', altKey: true })

      expect(onAction).toHaveBeenCalledTimes(1)
      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(true)
    })

    it('does not move focus to do it', () => {
      render(
        <>
          <input aria-label="Elsewhere" />
          <ToastViewport toast={withShortcut()} onDismiss={vi.fn()} />
        </>,
      )
      screen.getByLabelText('Elsewhere').focus()

      press({ code: 'KeyZ', altKey: true })

      expect(screen.getByLabelText('Elsewhere')).toHaveFocus()
    })

    it.each([
      ['Z alone', { code: 'KeyZ' }],
      ['Alt with another key', { code: 'KeyX', altKey: true }],
      ['Ctrl+Alt+Z, which is AltGr+Z on Windows', { code: 'KeyZ', altKey: true, ctrlKey: true }],
      ['Cmd+Alt+Z', { code: 'KeyZ', altKey: true, metaKey: true }],
      ['Shift+Alt+Z', { code: 'KeyZ', altKey: true, shiftKey: true }],
      ['Alt+Z held down', { code: 'KeyZ', altKey: true, repeat: true }],
    ])('ignores %s', (_what, init) => {
      const onAction = vi.fn()
      render(<ToastViewport toast={withShortcut(onAction)} onDismiss={vi.fn()} />)

      const event = press(init)

      expect(onAction).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('says the shortcut to a screen reader in the toast, and shows it beside the button', () => {
      render(<ToastViewport toast={withShortcut()} onDismiss={vi.fn()} />)

      expect(screen.getByRole('status')).toHaveTextContent('Transaction deleted. Press Alt+Z to undo.')
      expect(screen.getByText('Alt+Z')).toHaveAttribute('aria-hidden', 'true')
    })

    it('stops answering once the toast is leaving or gone', () => {
      const onAction = vi.fn()
      const { rerender, unmount } = render(<ToastViewport toast={withShortcut(onAction)} onDismiss={vi.fn()} />)

      rerender(<ToastViewport toast={null} onDismiss={vi.fn()} />)
      press({ code: 'KeyZ', altKey: true })
      expect(onAction).not.toHaveBeenCalled()

      unmount()
      press({ code: 'KeyZ', altKey: true })
      expect(onAction).not.toHaveBeenCalled()
    })

    it('has no shortcut text for a button that has none', () => {
      render(<ToastViewport toast={{ ...toast, action: { label: 'Undo', onAction: vi.fn() } }} onDismiss={vi.fn()} />)

      expect(screen.getByRole('status').textContent).toBe('Transaction deletedUndo')
      press({ code: 'KeyZ', altKey: true })
    })
  })
})
