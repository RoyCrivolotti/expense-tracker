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
