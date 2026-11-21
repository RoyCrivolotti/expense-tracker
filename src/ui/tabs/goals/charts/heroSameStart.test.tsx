import { createHash } from 'node:crypto'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GoalScenario } from '../../../../types'
import { planFromToday } from '../../../../engine'
import { installFakeIntersectionObserver } from '../../../../testing/fakeIntersectionObserver'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { SAMPLE_MILESTONES, samplePlan } from '../../../../testing/samplePlan'
import type { ChartSeries } from '../../../charts/LinearChart'
import { AssumedInflationContext } from '../../../hooks/assumedInflationContext'
import { NARROW_MQ } from '../useGoalsNarrow'
import { NetWorthChart } from './NetWorthChart'
import { createHeroLegendStore } from './heroLegendStore'
import { PHONE_MQ } from './sheetOrientation'

/**
 * The hero chart of someone whose scenarios all start on one day, held still. Scenarios that start
 * on different days are drawn on one calendar; none of that may reach a chart where every start is
 * the same, so this records what such a chart draws and says, case by case, and fails on any change.
 * The drawing is kept as a fingerprint of the chart's markup, the words as they are, so a change in
 * what it says shows in the diff.
 */

const START = '2026-01-01'
const INFLATION = 0.02

const plan = samplePlan({
  id: 1,
  name: 'Plan',
  sortOrder: 0,
  isActive: true,
  planStartDate: START,
  lifeEvents: [
    { year: 4, label: 'Car', amountCents: -2_000_000 },
    { year: 12, label: 'Gift', amountCents: 1_000_000 },
  ],
})
const renter = samplePlan({ id: 2, name: 'Rent', sortOrder: 1, isActive: false, housePurchaseYear: null, horizonYears: 25, color: '#10b981' })
const longer = samplePlan({ id: 3, name: 'Longer', sortOrder: 2, isActive: false, horizonYears: 35, housePurchaseYear: 0, color: '#f59e0b' })
const hidden = samplePlan({ id: 4, name: 'Hidden', sortOrder: 3, isActive: false, color: '#f43f5e' })
const all: GoalScenario[] = [plan, renter, longer, hidden]
const fromToday = planFromToday(plan, { investedCents: 6_500_000, date: '2027-03-01' }, INFLATION)
const checkins: ChartSeries = {
  id: 'actuals-overlay',
  color: 'var(--color-text)',
  values: [],
  kind: 'scatter',
  points: [
    { xIndex: 0.5, value: 5_600_000 },
    { xIndex: 1.16, value: 6_500_000 },
  ],
}
const extra = [checkins]

interface Case {
  name: string
  narrow: boolean
  draft?: GoalScenario
  dirty?: boolean
  nominal?: boolean
  preview?: number
  scenarios?: GoalScenario[]
  noStore?: boolean
}

const CASES: Case[] = [
  { name: 'wide, the plan open', narrow: false },
  { name: 'wide, the plan edited', narrow: false, draft: { ...plan, monthlyContributionCents: 120_000 }, dirty: true },
  { name: 'wide, Nominal', narrow: false, nominal: true },
  { name: 'wide, Nominal at a previewed rate', narrow: false, nominal: true, preview: 0.04 },
  { name: 'wide, another scenario open', narrow: false, draft: renter },
  { name: 'phone, the plan open', narrow: true, noStore: true },
  { name: 'phone, Nominal', narrow: true, noStore: true, nominal: true },
  {
    name: 'no start dates at all',
    narrow: false,
    scenarios: all.map((s) => ({ ...s, planStartDate: null })),
    draft: { ...plan, planStartDate: null },
  },
]

function media(narrow: boolean) {
  installFakeMatchMedia((q) => (narrow ? q === NARROW_MQ || q === PHONE_MQ || q === '(hover: none)' : false))
}

function renderCase(c: Case) {
  const store = c.noStore ? undefined : createHeroLegendStore()
  const scenarios = c.scenarios ?? all
  const draft = c.draft ?? scenarios[0]!
  const utils = render(
    <AssumedInflationContext.Provider value={INFLATION}>
      <NetWorthChart
        milestones={SAMPLE_MILESTONES}
        scenarios={scenarios}
        draft={draft}
        activeId={draft.id}
        dirty={c.dirty ?? false}
        variant="hero"
        hiddenIds={new Set([hidden.id])}
        onToggleVisible={() => undefined}
        extraSeries={extra}
        todayIndex={1.2}
        fromToday={c.scenarios ? null : fromToday}
        nominalMode={c.nominal ?? false}
        viewInflation={c.preview ?? null}
        legendStore={store}
        displaySwitch={<div role="group" aria-label="Display switch" />}
      />
    </AssumedInflationContext.Provider>,
  )
  return { ...utils, store }
}

function fingerprint(el: Element): string {
  return createHash('sha256').update(el.outerHTML).digest('hex').slice(0, 16)
}

/** What a reader sees of the chart at one moment: the drawing's fingerprint and every word around it. */
function reading(container: HTMLElement, store: ReturnType<typeof createHeroLegendStore> | undefined) {
  const svg = container.querySelector('svg[role="img"]')!
  return {
    drawing: fingerprint(svg),
    axis: [...svg.querySelectorAll('text')].map((t) => t.textContent).filter(Boolean).join(' | '),
    card: (container.textContent ?? '').replace(/\s+/g, ' ').trim(),
    tooltip: screen.queryByRole('tooltip')?.textContent ?? null,
    chips: store?.get().map((i) => `${i.label}: ${i.valueCents ?? (i.outOfRun ? '-' : '')}${i.hidden ? ' (hidden)' : ''}`) ?? null,
  }
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2027-03-15T12:00:00Z'))
})
afterAll(() => vi.useRealTimers())
afterEach(() => installFakeMatchMedia())

describe('the hero chart when every scenario starts on one day', () => {
  for (const c of CASES) {
    it(`draws and says what it always has: ${c.name}`, () => {
      media(c.narrow)
      const io = installFakeIntersectionObserver()
      const { container, store, unmount } = renderCase(c)
      const svg = container.querySelector('svg[role="img"]')!
      if (c.narrow) svg.parentElement!.getBoundingClientRect = () => ({ top: 600, bottom: 700, height: 100 }) as DOMRect
      const seen: Record<string, unknown> = { rest: reading(container, store) }
      for (const [label, key, times] of [
        ['first year', 'Home', 0],
        ['a year with a step', 'ArrowRight', 4],
        ['the purchase year', 'ArrowRight', 4],
        ['past the shorter scenario', 'End', 0],
      ] as const) {
        fireEvent.keyDown(svg, { key })
        for (let i = 0; i < times; i++) fireEvent.keyDown(svg, { key: 'ArrowRight' })
        // On a phone the tooltip shows while the legend is out of view and the chart is in it.
        if (c.narrow) act(() => io.emit(0.8))
        seen[label] = reading(container, store)
      }
      fireEvent.keyDown(svg, { key: 'Escape' })
      expect(seen).toMatchSnapshot()
      unmount()
    })
  }

  it('draws and says what it always has in the 10-year window', () => {
    media(false)
    const { container, store } = renderCase({ name: 'window', narrow: false })
    fireEvent.click(screen.getByRole('radio', { name: '10Y' }))
    const svg = container.querySelector('svg[role="img"]')!
    const rest = reading(container, store)
    fireEvent.keyDown(svg, { key: 'End' })
    expect({ rest, last: reading(container, store) }).toMatchSnapshot()
  })

  it('draws and says what it always has with a milestone picked', () => {
    media(false)
    const { container, store } = renderCase({ name: 'milestone', narrow: false })
    const chips = screen.getByRole('group', { name: 'Milestones' })
    fireEvent.click(within(chips).getAllByRole('button', { pressed: false })[2]!)
    expect(reading(container, store)).toMatchSnapshot()
  })

  it('draws and says what it always has full screen on a phone', () => {
    media(true)
    renderCase({ name: 'sheet', narrow: true, noStore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Open the chart full screen' }))
    const dialog = screen.getByRole('dialog', { name: /full screen/ })
    const svg = dialog.querySelector('svg[role="img"]')!
    const rest = reading(dialog, undefined)
    fireEvent.keyDown(svg, { key: 'End' })
    const last = reading(dialog, undefined)
    fireEvent.keyDown(svg, { key: 'Home' })
    for (let i = 0; i < 8; i++) fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect({ rest, last, purchase: reading(dialog, undefined) }).toMatchSnapshot()
  })
})
