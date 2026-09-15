import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}))

import { PwaUpdatePrompt } from './PwaUpdatePrompt'

afterEach(() => {
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
})
