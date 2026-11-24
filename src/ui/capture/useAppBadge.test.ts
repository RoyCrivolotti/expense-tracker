import { describe, expect, it, vi } from 'vitest'
import { showOnAppBadge } from './useAppBadge'

const badging = () => ({
  setAppBadge: vi.fn().mockResolvedValue(undefined),
  clearAppBadge: vi.fn().mockResolvedValue(undefined),
})

describe('showOnAppBadge', () => {
  it('puts the count on the icon', async () => {
    const nav = badging()
    await showOnAppBadge(nav, 8)
    expect(nav.setAppBadge).toHaveBeenCalledWith(8)
    expect(nav.clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the icon at zero rather than showing a 0', async () => {
    const nav = badging()
    await showOnAppBadge(nav, 0)
    expect(nav.clearAppBadge).toHaveBeenCalledWith()
    expect(nav.setAppBadge).not.toHaveBeenCalled()
  })

  it('calls the API on the navigator, as the browser requires', async () => {
    // A browser throws "Illegal invocation" for a call that is not on the navigator, and the refusal is swallowed, so
    // the receiver is recorded here and checked after the call rather than asserted inside it.
    const receivers: unknown[] = []
    const record = function (this: unknown) {
      receivers.push(this)
      return Promise.resolve()
    }
    const nav = { setAppBadge: vi.fn(record), clearAppBadge: vi.fn(record) }
    await showOnAppBadge(nav, 2)
    await showOnAppBadge(nav, 0)
    expect(receivers).toEqual([nav, nav])
  })

  it('does nothing where the browser has no Badging API', async () => {
    await expect(showOnAppBadge({}, 3)).resolves.toBeUndefined()
    await expect(showOnAppBadge({}, 0)).resolves.toBeUndefined()
    await expect(showOnAppBadge(undefined, 3)).resolves.toBeUndefined()
    await expect(showOnAppBadge(null, 3)).resolves.toBeUndefined()
  })

  it('swallows a refusal, whether the call throws or rejects', async () => {
    const rejects = { setAppBadge: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) }
    const throws = {
      clearAppBadge: vi.fn(() => {
        throw new Error('no')
      }),
    }
    await expect(showOnAppBadge(rejects, 4)).resolves.toBeUndefined()
    await expect(showOnAppBadge(throws, 0)).resolves.toBeUndefined()
  })
})
