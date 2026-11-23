import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewCore } from '../capture/reviewContext'
import { makeRecommendation, makeSeriesModel } from '../../testing/reviewKit'

// The capture code that reads pushes, held back until the test lets it arrive, as on a slow network. Its own file so
// the module the hook keeps once fetched starts empty.
let release: () => void = () => undefined
const arrived = new Promise<void>((resolve) => {
  release = resolve
})
vi.mock('../capture/recurringMarks', async (importOriginal) => {
  await arrived
  return importOriginal()
})

const { ReviewContext } = await import('../capture/reviewContext')
const { UpcomingSlot } = await import('./UpcomingSlot')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T12:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('the Upcoming card while the push reading is on its way', () => {
  it('waits for it after the pushes are read, so the mark comes with the card', async () => {
    const model = makeSeriesModel()
    const items = [makeRecommendation({ merchantRaw: 'PAYPROC*XY 77', amountCents: 1299, localDate: '2026-11-11' })]
    const core = { model, items, loads: 1, error: null, openForm: vi.fn() } as unknown as ReviewCore
    render(
      <ReviewContext.Provider value={core}>
        <UpcomingSlot model={model} month="2026-11" onAdd={vi.fn()} />
      </ReviewContext.Provider>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()

    release()

    expect(await screen.findByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Captured from your bank, review')).toBeInTheDocument()
  })
})
