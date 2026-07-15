import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
