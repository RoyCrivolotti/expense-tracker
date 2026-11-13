import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMotionDisabledForTests } from './motion'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

function Trigger({ message, tone }: { message: string; tone: 'info' | 'error' }) {
  const { showToast } = useToast()
  return (
    <button type="button" onClick={() => showToast(message, tone)}>
      go
    </button>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  setMotionDisabledForTests(true)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ToastProvider', () => {
  it('keeps an error up longer than a notice', () => {
    const { rerender } = render(
      <ToastProvider>
        <Trigger message="Saved" tone="info" />
      </ToastProvider>,
    )
    act(() => screen.getByText('go').click())
    expect(screen.getByRole('status').textContent).toBe('Saved')

    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(screen.queryByRole('status')).toBeNull()

    rerender(
      <ToastProvider>
        <Trigger message="Something went wrong on our side" tone="error" />
      </ToastProvider>,
    )
    act(() => screen.getByText('go').click())
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(screen.getByRole('status').textContent).toBe('Something went wrong on our side')

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a toast with a button up long enough to find it, and runs what the button offers once', () => {
    const onAction = vi.fn()
    function WithUndo() {
      const { showToast } = useToast()
      return (
        <button type="button" onClick={() => showToast('Removed Horizon from the bar', 'info', { label: 'Undo', onAction })}>
          go
        </button>
      )
    }
    render(
      <ToastProvider>
        <WithUndo />
      </ToastProvider>,
    )
    act(() => screen.getByText('go').click())

    act(() => {
      vi.advanceTimersByTime(5500)
    })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    act(() => screen.getByRole('button', { name: 'Undo' }).click())
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()

    act(() => screen.getByText('go').click())
    act(() => {
      vi.advanceTimersByTime(6100)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('turns an unhandled rejection into an error toast', () => {
    render(
      <ToastProvider>
        <span>app</span>
      </ToastProvider>,
    )

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), {
          reason: new Error('boom'),
          promise: Promise.resolve(),
        }),
      )
    })

    expect(screen.getByRole('status').textContent).toMatch(/Something went wrong/)
  })
})

describe('ToastProvider hold time', () => {
  it('keeps a message exactly as long as the caller says, and shows a line break as one', () => {
    function Hold() {
      const { showToast } = useToast()
      return (
        <button type="button" onClick={() => showToast('Added\nExpense', 'success', { label: 'Undo', onAction: () => {} }, { holdMs: 5000 })}>
          go
        </button>
      )
    }
    render(
      <ToastProvider>
        <Hold />
      </ToastProvider>,
    )
    act(() => screen.getByText('go').click())

    act(() => void vi.advanceTimersByTime(4999))
    expect(screen.getByRole('status').textContent).toContain('Added\nExpense')
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('ToastProvider dismissToast and taps', () => {
  function Pair() {
    const { showToast, dismissToast } = useToast()
    return (
      <>
        <button type="button" onClick={() => showToast('First', 'success', { label: 'Undo', onAction: () => {} }, { key: 'one', keepOnTap: true })}>
          first
        </button>
        <button type="button" onClick={() => showToast('Second', 'info', undefined, { key: 'two' })}>
          second
        </button>
        <button type="button" onClick={() => dismissToast?.('one')}>
          dismiss one
        </button>
      </>
    )
  }
  const show = () =>
    render(
      <ToastProvider>
        <Pair />
      </ToastProvider>,
    )

  it('takes down the toast with that key', () => {
    show()
    act(() => screen.getByText('first').click())

    act(() => screen.getByText('dismiss one').click())

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('leaves a later toast alone when the key is of an earlier one', () => {
    show()
    act(() => screen.getByText('first').click())
    act(() => screen.getByText('second').click())

    act(() => screen.getByText('dismiss one').click())

    expect(screen.getByRole('status').textContent).toBe('Second')
  })

  it('does nothing when no toast is up', () => {
    show()

    expect(() => act(() => screen.getByText('dismiss one').click())).not.toThrow()
  })

  it('keeps a toast up when its words are tapped only if it asked to, and a toast without that still goes', () => {
    show()
    act(() => screen.getByText('first').click())
    act(() => screen.getByText('First').click())
    expect(screen.getByRole('status').textContent).toContain('First')

    act(() => screen.getByText('second').click())
    act(() => screen.getByText('Second').click())
    expect(screen.queryByRole('status')).toBeNull()
  })
})

