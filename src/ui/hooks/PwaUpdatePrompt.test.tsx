import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
let needRefresh = false

let registerOptions: { onNeedReload?: () => void } | undefined

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onNeedReload?: () => void }) => {
    registerOptions = options
    return {
      needRefresh: [needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    }
  },
}))

import { PwaUpdatePrompt } from './PwaUpdatePrompt'
import { holdUpdateReload, resetUpdateReloadHoldForTests } from './updateReloadHold'

afterEach(() => {
  resetUpdateReloadHoldForTests()
  vi.unstubAllEnvs()
  updateServiceWorker.mockClear()
  needRefresh = false
})

/** The banner is production-only, and tests do not run in production mode. */
function renderInProd(waiting: boolean) {
  vi.stubEnv('PROD', true)
  needRefresh = waiting
  render(<PwaUpdatePrompt />)
}

describe('PwaUpdatePrompt', () => {
  it('offers a reload once a new service worker is waiting', () => {
    renderInProd(true)

    expect(screen.getByText('Update available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('applies the waiting worker and reloads when asked', async () => {
    renderInProd(true)

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))

    // `true` is the reload: skipWaiting alone leaves the old page running.
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('stays out of the way while nothing is waiting', () => {
    renderInProd(false)

    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })

  it('never shows outside production, where there is no service worker to update', () => {
    needRefresh = true
    render(<PwaUpdatePrompt />)

    expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  })

  it('announces itself politely rather than interrupting', () => {
    renderInProd(true)

    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })

  it('sends the update reload through the hold, so an open form is not reloaded away', () => {
    const reload = vi.fn()
    const location = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, reload } })
    try {
      renderInProd(false)
      const release = holdUpdateReload()
      registerOptions?.onNeedReload?.()
      expect(reload).not.toHaveBeenCalled()
      release()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location })
    }
  })
})
