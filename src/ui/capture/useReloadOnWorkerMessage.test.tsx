import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../data/recommendationsApi'
import { useReloadOnWorkerMessage } from './useReloadOnWorkerMessage'

function fakeContainer() {
  const target = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: target })
  return target
}
const send = (target: EventTarget, data: unknown) => target.dispatchEvent(new MessageEvent('message', { data }))

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('a message from the service worker', () => {
  it('reads the list again for a review-changed message, and ignores anything else', () => {
    const reload = vi.spyOn(api, 'reloadRecommendations').mockImplementation(() => undefined)
    const target = fakeContainer()
    renderHook(() => useReloadOnWorkerMessage())

    send(target, { type: 'something-else' })
    send(target, 'review-changed')
    send(target, null)
    expect(reload).not.toHaveBeenCalled()
    send(target, { type: 'review-changed' })

    expect(reload).toHaveBeenCalledOnce()
  })

  it('stops listening when the app unmounts', () => {
    const reload = vi.spyOn(api, 'reloadRecommendations').mockImplementation(() => undefined)
    const target = fakeContainer()
    const { unmount } = renderHook(() => useReloadOnWorkerMessage())
    unmount()

    send(target, { type: 'review-changed' })

    expect(reload).not.toHaveBeenCalled()
  })

  it('does nothing where there is no service worker', () => {
    expect(() => renderHook(() => useReloadOnWorkerMessage())).not.toThrow()
  })
})
