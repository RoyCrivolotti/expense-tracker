import { render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { restartFromLatest } from '../../../engine'
import type { PlanFromToday } from '../../../engine'
import { makeActions } from '../../../testing/makeActions'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import type { ChartSeries } from '../../charts/LinearChart'
import { PlanHero } from './PlanHero'
import { useScenarioEditor } from './useScenarioEditor'

const hero = vi.hoisted(() => ({
  todayIndex: undefined as number | undefined,
  extraSeries: [] as ChartSeries[],
}))
vi.mock('./charts/NetWorthChart', () => ({
  NetWorthChart: (props: {
    todayIndex?: number
    extraSeries?: ChartSeries[]
  }) => {
    hero.todayIndex = props.todayIndex
    hero.extraSeries = props.extraSeries ?? []
    return null
  },
}))

const display = {
  mode: 'purchasing-power' as const,
  onModeChange: vi.fn(),
  assumedInflation: 0,
  preview: null,
  onPreview: vi.fn(),
  onOpenSetting: undefined,
}

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
        draft={result.current.deferredDraft}
        activeScenario={result.current.activeScenario}
        editor={result.current}
        milestones={[]}
        checkins={[]}
        accounts={[]}
        fromToday={null}
        display={display}
      />,
    )

    expect(hero.todayIndex).toBe(0)
  })
})

describe('PlanHero check-in dots', () => {
  const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, planStartDate: '2026-06-25' })
  const broker = makeWealthAccount({ id: 1 })
  const checkin = (id: number, checkinDate: string, valueCents: number) =>
    makeWealthCheckin({ id, checkinDate, entries: [{ accountId: 1, valueCents }] })
  const checkins = [checkin(1, '2026-06-01', 90_000_00), checkin(2, '2026-07-29', 107_000_00), checkin(3, '2026-10-05', 138_000_00)]

  function renderHero(shown: ReturnType<typeof makeScenario>, extra: { fromToday?: PlanFromToday | null } = {}) {
    const dataset = makeDataset({ goalScenarios: [plan] })
    const { result } = renderHook(() => useScenarioEditor(dataset, makeActions(), 0))
    render(
      <PlanHero
        scenarios={[shown]}
        draft={result.current.deferredDraft}
        activeScenario={shown}
        editor={result.current}
        milestones={[]}
        checkins={checkins}
        accounts={[broker]}
        fromToday={extra.fromToday ?? null}
        display={display}
      />,
    )
    return hero.extraSeries.find((s) => s.id === 'actuals-overlay')?.points ?? []
  }

  it('leaves out a reading from before the plan began, which has no place on its axis', () => {
    const points = renderHero(plan)
    expect(points).toHaveLength(2)
    expect(points.every((p) => p.xIndex >= 0)).toBe(true)
  })

  it('has only the latest reading, on the first year line, when the plan is restarted from it', () => {
    const restarted = restartFromLatest(plan, { investedCents: 138_000_00, date: '2026-10-05' })
    const points = renderHero(restarted)
    expect(points).toEqual([{ xIndex: 0, value: 138_000_00 }])
  })
})
