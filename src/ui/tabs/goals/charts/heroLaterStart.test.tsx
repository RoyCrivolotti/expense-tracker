import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GoalScenario } from '../../../../types'
import { planFromToday, projectNetWorth, scenarioToParams, startLater, suggestedStart, valueOnAxisAt, yearsBetween } from '../../../../engine'
import { installFakeIntersectionObserver } from '../../../../testing/fakeIntersectionObserver'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { SAMPLE_MILESTONES, samplePlan } from '../../../../testing/samplePlan'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { formatMoneyShort } from '../chartTheme'
import { NARROW_MQ } from '../useGoalsNarrow'
import { NetWorthChart } from './NetWorthChart'
import { fromTodayPoints } from './fromTodayLine'
import { createHeroLegendStore } from './heroLegendStore'
import { useChartLegendState } from './heroLegendState'
import { pickCrossings } from './milestonePick'
import { PHONE_MQ } from './sheetOrientation'
import { EU_MONEY_FORMAT } from '../../../../engine/money'

/**
 * A plan that starts on 1 January 2026, and a copy of it that starts on 1 July 2027 from its own line's
 * figure (invented figures throughout). Every place the chart states a figure reads it in one place, so
 * at any year of the axis the chips, the legend, the tooltip, the full-screen readout and the engine
 * agree to the cent.
 */
const RATE = 0.02
const plan = samplePlan({ id: 1, name: 'Plan', sortOrder: 0, isActive: true, planStartDate: '2026-01-01' })
const LATER_START = '2027-07-01'
const later: GoalScenario = (() => {
  const start = suggestedStart(plan, null, LATER_START, RATE)!
  return { ...plan, ...startLater(plan, { date: LATER_START, investedCents: start.cents }, RATE)!.patch, id: 2, name: 'Later', sortOrder: 1, isActive: false, color: '#f59e0b', planStartDate: LATER_START }
})()
const offset = yearsBetween('2026-01-01', LATER_START)
const laterPoints = projectNetWorth(scenarioToParams(later, RATE))
const engineAt = (year: number) => valueOnAxisAt(laterPoints, offset, RATE, year)

function Chart(props: Partial<Parameters<typeof NetWorthChart>[0]>) {
  return (
    <AssumedInflationContext.Provider value={RATE}>
      <NetWorthChart milestones={SAMPLE_MILESTONES} scenarios={[plan, later]} draft={plan} activeId={plan.id} variant="hero" {...props} />
    </AssumedInflationContext.Provider>
  )
}

const svgOf = (root: HTMLElement) => root.querySelector('svg[role="img"]') as SVGSVGElement
function pointAt(svg: Element, year: number) {
  fireEvent.keyDown(svg, { key: 'Home' })
  for (let i = 0; i < year; i++) fireEvent.keyDown(svg, { key: 'ArrowRight' })
}
const laterChip = (store: ReturnType<typeof createHeroLegendStore>) => store.get().find((i) => i.scenarioId === later.id)

afterEach(() => installFakeMatchMedia())

describe('a scenario that starts later, read on the hero chart', () => {
  it('gives the same figure in its chip, the tooltip, the full-screen readout and the engine, at any year', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    const io = installFakeIntersectionObserver()
    const store = createHeroLegendStore()
    const { container } = render(<Chart legendStore={store} />)
    const svg = svgOf(container)
    svg.parentElement!.getBoundingClientRect = () => ({ top: 600, bottom: 700, height: 100 }) as DOMRect
    for (const year of [2, 10, 31]) {
      pointAt(svg, year)
      act(() => io.emit(0.5))
      const cents = engineAt(year)!
      expect(laterChip(store)?.valueCents).toBe(cents)
      const row = within(screen.getByRole('tooltip')).getByText('Later').parentElement!
      expect(row).toHaveTextContent(formatMoneyShort(cents, EU_MONEY_FORMAT))
    }
    // Before its start it says when it starts, in the chip and the tooltip, and has no figure.
    pointAt(svg, 1)
    act(() => io.emit(0.5))
    expect(laterChip(store)).toMatchObject({ valueCents: null, status: 'starts Jul 2027', note: 'from Jul 2027' })
    expect(within(screen.getByRole('tooltip')).getByText('starts Jul 2027')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('2027')
  })

  it('reads the full-screen readout where the chips read', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ || q === PHONE_MQ || q === '(hover: none)')
    render(<Chart />)
    fireEvent.click(screen.getByRole('button', { name: 'Open the chart full screen' }))
    const dialog = screen.getByRole('dialog', { name: /full screen/ })
    const svg = svgOf(dialog)
    pointAt(svg, 10)
    expect(within(dialog).getByText('2036', { selector: 'p' })).toBeInTheDocument()
    expect(within(dialog).getByText('Later').closest('li')).toHaveTextContent(formatMoneyShort(engineAt(10)!, EU_MONEY_FORMAT))
    // Past the plan's end, on a calendar, the plan gives its last figure and the year it ended, as the table does.
    pointAt(svg, 31)
    const last = formatMoneyShort(projectNetWorth(scenarioToParams(plan, RATE)).at(-1)!.investedCents, EU_MONEY_FORMAT)
    expect(within(dialog).getByText('Plan (editing)').closest('li')).toHaveTextContent(`${last} (ended 2056)`)
  })

  it('reads the same cents through the legend state the readout uses', () => {
    const store = createHeroLegendStore()
    render(<Chart legendStore={store} />)
    // The chips at rest read the last year every scenario reaches: the plan ends in 2056, axis year 30.
    expect(laterChip(store)?.valueCents).toBe(engineAt(30))
    const { result } = renderHook(() =>
      useChartLegendState(
        {
          lines: [{ id: 'l', scenarioId: 2, name: 'Later', color: '#000', dashed: false, params: scenarioToParams(later, RATE), offsetYears: offset, startsIn: 'Jul 2027', endsIn: '2057', ownMoney: '2027 euros' }],
          readings: [{ id: 'l', color: '#000', values: Array.from({ length: 33 }, (_, y) => engineAt(y) ?? undefined) }],
          names: ['Later'],
          years: Array.from({ length: 33 }, (_, y) => y),
          scenarios: [later],
          hiddenIds: undefined,
          calendarOrigin: '2026-01-01',
        },
        null,
        30,
      ),
    )
    expect(result.current.legendItems[0]?.valueCents).toBe(engineAt(30))
  })

  it('past a scenario’s end gives its last figure and the year it ended, in the chip and the tooltip', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    const io = installFakeIntersectionObserver()
    const store = createHeroLegendStore()
    const { container } = render(<Chart legendStore={store} />)
    const svg = svgOf(container)
    svg.parentElement!.getBoundingClientRect = () => ({ top: 600, bottom: 700, height: 100 }) as DOMRect
    pointAt(svg, 31)
    act(() => io.emit(0.5))
    const last = projectNetWorth(scenarioToParams(plan, RATE)).at(-1)!.investedCents
    expect(store.get().find((i) => i.label.startsWith('Plan'))).toMatchObject({ valueCents: last, endedIn: '2056' })
    expect(within(screen.getByRole('tooltip')).getByText(`${formatMoneyShort(last, EU_MONEY_FORMAT)} (ended 2056)`)).toBeInTheDocument()
  })

  it('rests on the last year every scenario reaches with one hidden, as the comparison table does', () => {
    const short = samplePlan({ id: 3, name: 'Short', sortOrder: 2, isActive: false, planStartDate: '2026-01-01', horizonYears: 20 })
    render(<Chart legendStore={createHeroLegendStore()} scenarios={[plan, later, short]} hiddenIds={new Set([3])} />)
    expect(screen.getByText(/The values in the chips above are for 2046, the last year every scenario reaches/)).toBeInTheDocument()
  })

  it('names calendar years on its axis and says which year the chips are for', () => {
    const store = createHeroLegendStore()
    const { container } = render(<Chart legendStore={store} />)
    const labels = [...svgOf(container).querySelectorAll('text')].map((t) => t.textContent)
    expect(labels).toEqual(expect.arrayContaining(['2026', '2031', '2056']))
    expect(screen.getByText('The values in the chips above are for 2056, the last year every scenario reaches, or for the year you point at.')).toBeInTheDocument()
  })

  it('marks where it starts, and says when while nothing is pointed at', () => {
    const { container } = render(<Chart legendStore={createHeroLegendStore()} />)
    expect(screen.getByText('starts Jul 2027')).toBeInTheDocument()
    expect(svgOf(container).querySelectorAll('circle[style*="245, 158, 11"]').length).toBeGreaterThanOrEqual(1)
    pointAt(svgOf(container), 5)
    expect(screen.queryByText('starts Jul 2027')).not.toBeInTheDocument()
  })

  it('rows on a phone show the resting year’s figures and say which year that is', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    render(<Chart />)
    expect(screen.getByText(/The values are for 2056, the last year every scenario reaches\./)).toBeInTheDocument()
    expect(screen.getByText('from Jul 2027')).toBeInTheDocument()
    expect(screen.getByText('Later').closest('li')).toHaveTextContent(formatMoneyShort(engineAt(30)!, EU_MONEY_FORMAT))
  })

  it('takes each figure up by the inflation to its own year in the Nominal view', () => {
    const store = createHeroLegendStore()
    const { container } = render(<Chart legendStore={store} nominalMode />)
    pointAt(svgOf(container), 12)
    expect(laterChip(store)?.valueCents).toBe(Math.round(engineAt(12)! * Math.pow(1 + RATE, 12)))
  })

  it('in a window that ends before it starts, is not drawn and its chip says when it starts', () => {
    const store = createHeroLegendStore()
    const lateStart = { ...later, planStartDate: '2033-07-01' }
    render(<Chart legendStore={store} scenarios={[plan, lateStart]} />)
    fireEvent.click(screen.getByRole('radio', { name: '5Y' }))
    expect(screen.queryByText('starts Jul 2033')).not.toBeInTheDocument()
    expect(laterChip(store)).toMatchObject({ valueCents: null, status: 'starts Jul 2033' })
    expect(screen.getByText(/for 2031, the last year shown/)).toBeInTheDocument()
  })

  it('moves the band, the purchase, the events and the FI line with the draft when it is the one edited', () => {
    // A spend whose FI target is far above the plan, so it is marked on the chart's top edge with its figure.
    const draft = { ...later, lifeEvents: [{ year: 3, label: 'Car', amountCents: -1_000_000 }], annualSpendCents: 40_000_000, safeWithdrawalRate: 0.04 }
    const { container } = render(<Chart draft={draft} activeId={later.id} legendStore={createHeroLegendStore()} />)
    const band = container.querySelector('path[aria-hidden][style*="fill"]')!
    const firstX = Number((band.getAttribute('d') ?? '').match(/M\s?([\d.]+)/)![1])
    const xAt = (place: number) => 56 + (place / 32) * (360 - 56 - 16)
    expect(firstX).toBeCloseTo(xAt(offset), 0)
    // The FI target is in the draft's euros, so on a chart in 2026 euros it is lower by the inflation between.
    const fi = Math.round(1_000_000_000 / Math.pow(1 + RATE, offset))
    expect(screen.getByText(`FI ${formatMoneyShort(fi, EU_MONEY_FORMAT)}`)).toBeInTheDocument()
    expect(formatMoneyShort(fi, EU_MONEY_FORMAT)).not.toBe(formatMoneyShort(1_000_000_000, EU_MONEY_FORMAT))
    // An event is named by the year of the draft's own plan it falls in.
    expect(screen.getByText('Car (year 3)')).toBeInTheDocument()
  })
})

describe('the plan from today on a plan that starts after another scenario', () => {
  it('moves along by the plan’s own place on the axis and is brought back by the inflation over it', () => {
    const fromToday = planFromToday(later, { investedCents: 20_000_000, date: '2028-03-01' }, RATE)!
    const own = fromTodayPoints(fromToday, RATE)
    const placed = fromTodayPoints(fromToday, RATE, offset)
    expect(placed[0]!.xIndex).toBeCloseTo(own[0]!.xIndex + offset, 9)
    expect(placed.at(-1)!.value).toBe(Math.round(own.at(-1)!.value * Math.pow(1 + RATE, -offset)) || placed.at(-1)!.value)
    expect(Math.abs(placed.at(-1)!.value - own.at(-1)!.value / Math.pow(1 + RATE, offset))).toBeLessThanOrEqual(1)
  })
})

describe('a milestone picked on a calendar axis', () => {
  it('dots a later scenario where its own years put it, at that day’s worth', () => {
    const lines = [{ id: 'l', name: 'Later', color: '#000', params: scenarioToParams(later, RATE), planStartDate: LATER_START, offsetYears: offset }]
    const years = Array.from({ length: 33 }, (_, y) => y)
    const { dots } = pickCrossings({ lines, amountCents: 50_000_000, inflationRate: RATE, nominalMode: false, years, today: '2026-11-20', locale: 'en-GB' })
    const atOrigin = pickCrossings({ lines: [{ ...lines[0]!, offsetYears: 0 }], amountCents: 50_000_000, inflationRate: RATE, nominalMode: false, years, today: '2026-11-20', locale: 'en-GB' })
    expect(dots[0]!.index).toBeCloseTo(atOrigin.dots[0]!.index + offset, 9)
    expect(dots[0]!.value).toBeCloseTo(50_000_000 / Math.pow(1 + RATE, dots[0]!.index), 3)
  })
})

describe('the axis with a scenario hidden', () => {
  // The comparison table's figures: A from 2026 for 5 years, B from 2032 for 10.
  const a = samplePlan({ id: 1, name: 'A', sortOrder: 0, isActive: true, planStartDate: '2026-01-01', horizonYears: 5 })
  const b = samplePlan({ id: 2, name: 'B', sortOrder: 1, isActive: false, color: '#f59e0b', planStartDate: '2032-01-01', horizonYears: 10 })

  function lastYearShown(props: Partial<Parameters<typeof NetWorthChart>[0]>) {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    const io = installFakeIntersectionObserver()
    const { container, unmount } = render(<Chart {...props} />)
    fireEvent.keyDown(svgOf(container), { key: 'End' })
    act(() => io.emit(0.5))
    const title = screen.getByRole('tooltip').textContent ?? ''
    unmount()
    return title
  }

  it('runs to 2042 with B hidden and rests there, where the table does, with A’s last figure', () => {
    installFakeMatchMedia((q) => q === NARROW_MQ)
    const lines = (container: HTMLElement) => container.querySelectorAll('svg[role="img"] path[fill="none"][style*="stroke"]').length
    const both = render(<Chart scenarios={[a, b]} draft={a} activeId={a.id} />)
    const drawnWithB = lines(both.container)
    both.unmount()
    const { container } = render(<Chart scenarios={[a, b]} draft={a} activeId={a.id} hiddenIds={new Set([b.id])} />)
    expect(screen.getByText(/The values are for 2042, the last year shown\./)).toBeInTheDocument()
    expect(screen.getByText('A (editing)').closest('li')).toHaveTextContent('(ended 2031)')
    // B is still not drawn: the axis runs on with years nothing is drawn in.
    expect(lines(container)).toBe(drawnWithB - 1)
    expect(lastYearShown({ scenarios: [a, b], draft: a, activeId: a.id, hiddenIds: new Set([b.id]) })).toMatch(/^2042/)
  })

  it('stays where it was when a line is hidden on a calendar', () => {
    // A 30-year plan from July 2027 ends in 2057, half way through axis year 2058.
    const long = { ...plan, id: 2, name: 'Long', sortOrder: 1, isActive: false, planStartDate: LATER_START }
    const props = { scenarios: [plan, long], draft: plan, activeId: plan.id }
    expect(lastYearShown(props)).toMatch(/^2058/)
    expect(lastYearShown({ ...props, hiddenIds: new Set([long.id]) })).toMatch(/^2058/)
  })

  it('still fits the lines drawn where every scenario starts on one day, as it always has', () => {
    const longer = { ...plan, id: 3, name: 'Longer', sortOrder: 2, isActive: false, horizonYears: 40 }
    const props = { scenarios: [plan, longer], draft: plan, activeId: plan.id }
    expect(lastYearShown(props)).toMatch(/^Year 40/)
    expect(lastYearShown({ ...props, hiddenIds: new Set([longer.id]) })).toMatch(/^Year 30/)
  })
})
