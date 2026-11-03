/**
 * The lookup for a saved copy is a chunk of its own, loaded only when the access check has failed. When that chunk
 * cannot be loaded (a build deployed since the app was last open, with no network to fetch it), the person gets the
 * connection screen and not a blank page.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'
import { AccessFailure } from './AccessFailure'

vi.mock('../../data/savedCopy', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

beforeEach(() => {
  installFakeMatchMedia()
  setOnline(false)
})
afterEach(() => setOnline(true))

describe('the access failure when the saved copy cannot be looked up', () => {
  it('shows the offline screen, with Try again only', async () => {
    render(<AccessFailure message="Load failed" answered={false} source={{ canWrite: false, load: vi.fn() }} onRetry={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
