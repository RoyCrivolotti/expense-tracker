import { render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeActions } from '../../../testing/makeActions'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { PlanHero } from './PlanHero'
import { useScenarioEditor } from './useScenarioEditor'

const hero = vi.hoisted(() => ({ todayIndex: undefined as number | undefined }))
vi.mock('./charts/NetWorthChart', () => ({
  NetWorthChart: (props: { todayIndex?: number }) => {
    hero.todayIndex = props.todayIndex
    return null
  },
}))

describe('PlanHero today marker', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
    vi.useRealTimers()
    hero.todayIndex = undefined
  })

  it('goes by the date where the reader is, not the UTC date', () => {
    // 12:30 on 2 October in Auckland is still 1 October in UTC, a day before the plan starts.
    process.env.TZ = 'Pacific/Auckland'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T23:30:00Z'))
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, planStartDate: '2026-10-02' })
    const dataset = makeDataset({ goalScenarios: [plan] })
    const { result } = renderHook(() => useScenarioEditor(dataset, makeActions(), 0))

    render(
      <PlanHero
        scenarios={[plan]}
        editor={result.current}
        milestones={[]}
        checkins={[]}
        accounts={[]}
        fromToday={null}
        display={{
          mode: 'purchasing-power',
          onModeChange: vi.fn(),
          assumedInflation: 0,
          preview: null,
          onPreview: vi.fn(),
          onOpenSetting: undefined,
        }}
      />,
    )

    expect(hero.todayIndex).toBe(0)
  })
})
