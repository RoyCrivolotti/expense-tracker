import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { ToastViewport, type ToastItem } from './Toast'

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
})
