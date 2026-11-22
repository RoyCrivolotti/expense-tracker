import { render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeActions } from '../../../testing/makeActions'
import { makeDataset, makeScenario, makeWealthCheckin } from '../../../testing/factories'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { PlanHero } from './PlanHero'
import { NARROW_MQ } from './useGoalsNarrow'
import { useScenarioEditor } from './useScenarioEditor'

const hero = vi.hoisted(
  (): {
    todayIndex: number | undefined
    headerAside: unknown
    displaySwitch: unknown
    footer: unknown
    extraSeries: unknown
  } => ({
    todayIndex: undefined,
    headerAside: undefined,
    displaySwitch: undefined,
    footer: undefined,
    extraSeries: undefined,
  }),
)
vi.mock('./charts/NetWorthChart', () => ({
  NetWorthChart: (props: {
    todayIndex?: number
    headerAside?: unknown
    displaySwitch?: unknown
    footer?: unknown
    extraSeries?: unknown
  }) => {
    hero.todayIndex = props.todayIndex
    hero.extraSeries = props.extraSeries
    hero.headerAside = props.headerAside
    hero.displaySwitch = props.displaySwitch
    hero.footer = props.footer
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

describe('PlanHero display switch', () => {
  afterEach(() => installFakeMatchMedia())

  function renderHero() {
    const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
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
  }

  it('gives the chart the switch for its full-screen bar on a phone, where the card keeps it elsewhere', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    renderHero()
    expect(hero.headerAside).toBeUndefined()
    expect(hero.displaySwitch).toBeDefined()
  })

  it('gives it the same switch beside the window buttons on a wide screen', () => {
    installFakeMatchMedia()
    renderHero()
    expect(hero.headerAside).toBeDefined()
    expect(hero.headerAside).toBe(hero.displaySwitch)
  })
})

describe('PlanHero shortfall note', () => {
  afterEach(() => installFakeMatchMedia())

  // 20.000 € and 500 € a month cannot pay the 80.000 € down payment in year 5.
  function renderFooter() {
    const plan = makeScenario({
      id: 1,
      name: 'Path A',
      sortOrder: 0,
      isActive: true,
      startInvestedCents: 2_000_000,
      monthlyContributionCents: 50_000,
      housePriceCents: 40_000_000,
      housePurchaseYear: 5,
    })
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
    render(<>{hero.footer}</>)
  }

  it('is in the footer on a wide screen', () => {
    installFakeMatchMedia()
    renderFooter()
    expect(screen.getByRole('status').textContent).toContain('The house needs more than the portfolio holds in year 5.')
  })

  it('is in the footer on a phone too', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    renderFooter()
    expect(screen.getByRole('status').textContent).toContain('The house needs more than the portfolio holds in year 5.')
  })
})

describe('PlanHero with a scenario that starts before the loaded one', () => {
  afterEach(() => {
    vi.useRealTimers()
    installFakeMatchMedia()
  })

  function renderWith(
    mode: 'purchasing-power' | 'nominal',
    earlierStart: string,
  ) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2028-07-01T12:00:00Z'))
    const plan = makeScenario({ id: 1, name: 'Later plan', sortOrder: 0, isActive: true, planStartDate: '2027-07-01' })
    const earlier = makeScenario({ id: 2, name: 'Earlier', sortOrder: 1, planStartDate: earlierStart })
    const dataset = makeDataset({ goalScenarios: [plan, earlier] })
    const { result } = renderHook(() => useScenarioEditor(dataset, makeActions(), 0))
    render(
      <PlanHero
        scenarios={[plan, earlier]}
        editor={result.current}
        milestones={[]}
        checkins={[makeWealthCheckin({ checkinDate: '2028-01-01' })]}
        accounts={[]}
        fromToday={null}
        display={{
          mode,
          onModeChange: vi.fn(),
          assumedInflation: 0,
          preview: null,
          onPreview: vi.fn(),
          onOpenSetting: undefined,
        }}
      />,
    )
    render(<>{hero.footer}</>)
  }

  it('places today and the check-ins from the earliest start, where the chart\u2019s axis begins', () => {
    renderWith('purchasing-power', '2026-01-01')
    expect(hero.todayIndex).toBeCloseTo(2.5, 2)
    expect((hero.extraSeries as { points: { xIndex: number }[] }[])[0]?.points[0]?.xIndex).toBeCloseTo(2, 2)
  })

  it('says the chart and the figures under it are in two moneys', () => {
    renderWith('purchasing-power', '2026-01-01')
    expect(
      screen.getByText(
        'The chart is in 2026 euros so the scenarios can be compared. The figures below are in 2027 euros, the year this scenario starts.',
      ),
    ).toBeInTheDocument()
  })

  it('names the two by month when they start in one year', () => {
    renderWith('purchasing-power', '2027-01-01')
    expect(
      screen.getByText(
        /The chart is in euros of Jan 2027 so the scenarios can be compared\. The figures below are in euros of Jul 2027, the month this scenario starts\./,
      ),
    ).toBeInTheDocument()
  })

  it('says nothing of it in the Nominal view, where the chart is in the euros of each year', () => {
    renderWith('nominal', '2026-01-01')
    expect(screen.queryByText(/so the scenarios can be compared/)).not.toBeInTheDocument()
  })
})
