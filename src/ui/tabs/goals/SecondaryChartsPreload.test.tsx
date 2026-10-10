import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDataset } from '../../../testing/factories'
import { draftFromDataset } from './goalsDefaults'
import { SecondaryCharts } from './SecondaryCharts'

const preload = vi.hoisted(() => vi.fn())
vi.mock('./charts/spreadChartLoader', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  preloadSpreadChart: preload,
}))

describe('the spread card ahead of its chip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    preload.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('fetches its code a moment after the charts are on the page, so the first tap on its chip finds it loaded', () => {
    const { unmount } = render(
      <SecondaryCharts scenarios={[]} draft={draftFromDataset(makeDataset(), 0)} monthly={[]} milestones={[]} reached={new Map()} activeId={null} dirty={false} fromToday={null} />,
    )
    expect(preload).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(preload).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not fetch it if the charts go away first', () => {
    const { unmount } = render(
      <SecondaryCharts scenarios={[]} draft={draftFromDataset(makeDataset(), 0)} monthly={[]} milestones={[]} reached={new Map()} activeId={null} dirty={false} fromToday={null} />,
    )
    unmount()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(preload).not.toHaveBeenCalled()
  })
})
