import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBackgroundErrorToast } from './useBackgroundErrorToast'
import { ToastContext, type ToastApi } from './useToast'

const toastSpy = () => vi.fn<ToastApi['showToast']>()

function Host({ error, refresh, showToast }: { error: string | null | undefined; refresh: () => void; showToast: ToastApi['showToast'] }) {
  return (
    <ToastContext.Provider value={{ showToast }}>
      <Probe error={error} refresh={refresh} />
    </ToastContext.Provider>
  )
}

function Probe({ error, refresh }: { error: string | null | undefined; refresh: () => void }) {
  useBackgroundErrorToast(error, refresh)
  return null
}

describe('useBackgroundErrorToast', () => {
  it('says nothing while there is no error', () => {
    const showToast = toastSpy()
    const { rerender } = render(<Host error={null} refresh={() => {}} showToast={showToast} />)
    rerender(<Host error={undefined} refresh={() => {}} showToast={showToast} />)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('tells the user once, with a button that refreshes', () => {
    const showToast = toastSpy()
    const refresh = vi.fn()
    const { rerender } = render(<Host error="reference: down" refresh={refresh} showToast={showToast} />)
    expect(showToast).toHaveBeenCalledTimes(1)
    const [message, tone, action] = showToast.mock.calls[0]!
    expect(message).toBe('Some figures may be out of date.')
    expect(tone).toBe('error')
    act(() => action?.onAction())
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender(<Host error="reference: down" refresh={refresh} showToast={showToast} />)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('tells the user again about a failure that comes after the error was cleared', () => {
    const showToast = toastSpy()
    const { rerender } = render(<Host error="down" refresh={() => {}} showToast={showToast} />)
    rerender(<Host error={null} refresh={() => {}} showToast={showToast} />)
    rerender(<Host error="down" refresh={() => {}} showToast={showToast} />)
    expect(showToast).toHaveBeenCalledTimes(2)
  })
})
