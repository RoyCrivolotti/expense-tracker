import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import { failureMessage, useFailureToast } from './useFailureToast'

function Host({ showToast }: { showToast: (message: string, tone?: string) => void }) {
  useFailureToast(showToast)
  return null
}

function rejection(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason, promise: Promise.resolve() })
}

describe('failureMessage', () => {
  it('passes the API message through, since it is written for the user', () => {
    expect(failureMessage(new ApiError('Something went wrong on our side', 500))).toBe(
      'Something went wrong on our side',
    )
    expect(failureMessage(new ApiError('Scenario name is required', 400))).toBe(
      'Scenario name is required',
    )
  })

  it('names the connection when fetch itself failed', () => {
    expect(failureMessage(new TypeError('Failed to fetch'))).toMatch(/reach the server/)
  })

  it('falls back to a generic message for anything else', () => {
    expect(failureMessage(new Error('boom'))).toMatch(/Something went wrong/)
    expect(failureMessage('not even an error')).toMatch(/Something went wrong/)
  })
})

describe('useFailureToast', () => {
  it('toasts an unhandled rejection as an error', () => {
    const showToast = vi.fn()
    render(<Host showToast={showToast} />)

    act(() => {
      window.dispatchEvent(rejection(new ApiError('Something went wrong on our side', 500)))
    })

    expect(showToast).toHaveBeenCalledWith('Something went wrong on our side', 'error')
  })

  it('toasts an uncaught error, but not a resource load failure', () => {
    const showToast = vi.fn()
    render(<Host showToast={showToast} />)

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }))
    })
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenLastCalledWith(expect.stringMatching(/Something went wrong/), 'error')

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'img failed' }))
    })
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('stops listening once unmounted', () => {
    const showToast = vi.fn()
    const { unmount } = render(<Host showToast={showToast} />)
    unmount()

    act(() => {
      window.dispatchEvent(rejection(new Error('late')))
    })

    expect(showToast).not.toHaveBeenCalled()
  })
})
