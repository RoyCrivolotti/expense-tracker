import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { ExpensesOfflineBanner } from './ExpensesOfflineBanner'
import { OfflineBanner } from './OfflineBanner'

describe('OfflineBanner', () => {
  it('shows offline copy when not connected', () => {
    render(<OfflineBanner online={false} snapshotAt="2026-06-15T10:00:00.000Z" />)
    expect(screen.getByText("You're offline")).toBeTruthy()
    expect(screen.getByText(/until you reconnect/)).toBeTruthy()
  })

  it('shows stale-cache copy when online but serving a snapshot', () => {
    render(<OfflineBanner online snapshotAt="2026-06-15T10:00:00.000Z" />)
    expect(screen.getByText('Showing saved data')).toBeTruthy()
    expect(screen.getByText(/Tap refresh to update/)).toBeTruthy()
  })
})

describe('ExpensesOfflineBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('shows nothing while the app can write', () => {
    render(<ExpensesOfflineBanner readOnly={false} online />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('folds away over its exit when the connection is back, still saying what it said, then goes', () => {
    const { rerender } = render(<ExpensesOfflineBanner readOnly online={false} />)
    const banner = screen.getByRole('status')
    const fold = banner.parentElement!.parentElement!
    expect(fold.className).not.toContain('folding')

    rerender(<ExpensesOfflineBanner readOnly={false} online />)

    expect(screen.getByText("You're offline")).toBeInTheDocument()
    expect(fold.className).toContain('folding')
    expect(fold.hasAttribute('inert')).toBe(true)
    expect(fold.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.fold}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.fold))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('passes the snapshot time on to the banner', () => {
    render(<ExpensesOfflineBanner readOnly online snapshotAt="2026-06-15T10:00:00.000Z" />)
    expect(screen.getByText(/Couldn't reach the server/)).toBeInTheDocument()
  })
})
