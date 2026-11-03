import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../testing/fakeMatchMedia'
import { AccessConnectionError } from './AccessConnectionError'

const NETWORK = 'Load failed'

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

function show(error: string, { standalone = false } = {}) {
  installFakeMatchMedia((query) => standalone && query === '(display-mode: standalone)')
  const onRetry = vi.fn()
  render(<AccessConnectionError error={error} onRetry={onRetry} />)
  return onRetry
}

beforeEach(() => setOnline(true))
afterEach(() => setOnline(true))

describe('the screen for an access check that did not answer', () => {
  it('says the server cannot be reached while the browser thinks it is online, with both ways on', () => {
    show(NETWORK)

    expect(screen.getByRole('heading', { name: 'Can’t reach the server' })).toBeInTheDocument()
    expect(screen.getByText('Check your connection, then try again or sign in.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('points the home-screen app at Sign in, which is where it signs in', () => {
    show(NETWORK, { standalone: true })

    expect(screen.getByText(/signs in separately from Safari/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends Sign in to the app’s address, where Access asks for the login', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    show(NETWORK)

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(assign).toHaveBeenCalledWith('/')
    vi.unstubAllGlobals()
  })

  it('says the person is offline, and offers only Try again, when the browser has no network', () => {
    setOnline(false)
    const onRetry = show(NETWORK, { standalone: true })

    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeInTheDocument()
    expect(screen.getByText(/no saved data on this device yet/)).toBeInTheDocument()
    // Sign in goes to `/`, which offline is this same screen.
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the expired-session wording and Sign in when the server answered, whatever the browser says', () => {
    setOnline(false)
    show('Request failed (401)')

    expect(screen.getByRole('heading', { name: 'Couldn’t check access' })).toBeInTheDocument()
    expect(screen.getByText('Your session may have expired. Sign in again to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows what the server said when it is neither', () => {
    show('Request failed (503)')

    expect(screen.getByRole('heading', { name: 'Couldn’t check access' })).toBeInTheDocument()
    expect(screen.getAllByText('Request failed (503)').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})
