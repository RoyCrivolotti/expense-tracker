import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planFromToday, projectNetWorth, scenarioToParams, valueOnAxisAt, yearsBetween } from '../../../engine'
import { samplePlan, SAMPLE_INFLATION } from '../../../testing/samplePlan'
import { AssumedInflationContext } from '../../hooks/assumedInflationContext'
import { scenarioToDraft } from './scenarioDraft'
import { TrackingFields } from './TrackingFields'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

const latest = { investedCents: 7_000_000, date: '2026-10-01' }
const plan = samplePlan({ id: 9, housePurchaseYear: null })
const fromToday = planFromToday(plan, latest, SAMPLE_INFLATION)!

/** The plan carried on from the check-in, on 1 Jul 2028, in 2028 euros: what the line offers. */
function planOn(date: string): number {
  const years = yearsBetween(latest.date, date)
  const points = projectNetWorth(scenarioToParams(fromToday.scenario, SAMPLE_INFLATION))
  return Math.round(valueOnAxisAt(points, 0, SAMPLE_INFLATION, years)! * (1 + SAMPLE_INFLATION) ** years)
}

function renderFields(draftOver: Parameters<typeof samplePlan>[0], otherPlan = fromToday, onChange = vi.fn()) {
  render(
    <AssumedInflationContext.Provider value={SAMPLE_INFLATION}>
      <TrackingFields draft={scenarioToDraft(samplePlan(draftOver))} latest={latest} otherPlan={otherPlan} onChange={onChange} />
    </AssumedInflationContext.Provider>,
  )
  return onChange
}

describe('the plan start section', () => {
  it('always says that moving the date keeps the amounts, and where to go to restate them', () => {
    renderFields({ planStartDate: '2026-01-01' })
    expect(screen.getByText(/Moving the date here keeps every amount as typed\. To start later with the amounts restated for inflation, use Start a\s+copy later\./)).toBeInTheDocument()
    expect(screen.queryByText(/The balance you expect/)).toBeNull()
  })

  it('says what a start after today’s balance is, how far it is from the plan, and offers the plan’s figure', () => {
    const onChange = renderFields({ planStartDate: '2028-07-01', housePurchaseYear: null, startInvestedCents: 5_000_000 })
    expect(screen.getByText(/The balance you expect to have invested on (1 Jul 2028|Jul 1, 2028), in 2028 euros\./)).toBeInTheDocument()
    const figure = planOn('2028-07-01')
    expect(screen.getByText(/Your plan, carried on from your latest check-in, has about/)).toHaveTextContent(/this starts from\s+50\.000 €, [\d.]+ € less\./)
    fireEvent.click(screen.getByRole('button', { name: /^Use / }))
    expect(onChange).toHaveBeenCalledWith({ startInvestedCents: figure })
  })

  it('says "more" when the typed balance is above the plan’s, and nothing within 1% of it', () => {
    renderFields({ planStartDate: '2028-07-01', housePurchaseYear: null, startInvestedCents: 50_000_000 })
    expect(screen.getByText(/Your plan, carried on/)).toHaveTextContent(/ more\.$/)
    screen.getByText(/The balance you expect/)
  })

  it('hides the comparison within 1% of the plan', () => {
    const figure = planOn('2028-07-01')
    renderFields({ planStartDate: '2028-07-01', housePurchaseYear: null, startInvestedCents: Math.round(figure * 1.009) })
    expect(screen.queryByText(/Your plan, carried on/)).toBeNull()
  })

  it('offers no figure from a plan without a house to a scenario that owns one, nor without another plan', () => {
    renderFields({ planStartDate: '2028-07-01', housePurchaseYear: 0, startInvestedCents: 1_000_000 })
    expect(screen.getByText(/The balance you expect/)).toBeInTheDocument()
    expect(screen.queryByText(/Your plan, carried on/)).toBeNull()
  })

  it('offers nothing when the plan is the scenario being edited', () => {
    render(
      <TrackingFields draft={scenarioToDraft(samplePlan({ planStartDate: '2028-07-01', housePurchaseYear: null }))} latest={latest} otherPlan={null} onChange={vi.fn()} />,
    )
    expect(screen.getByText(/The balance you expect/)).toBeInTheDocument()
    expect(screen.queryByText(/Your plan, carried on/)).toBeNull()
  })

  it('shows the comparison from just past 1% apart', () => {
    const figure = planOn('2028-07-01')
    renderFields({ planStartDate: '2028-07-01', housePurchaseYear: null, startInvestedCents: Math.round(figure * 0.98) })
    expect(screen.getByText(/Your plan, carried on/)).toBeInTheDocument()
  })

  it('says nothing about a future start for one that starts today', () => {
    renderFields({ planStartDate: '2026-11-21', housePurchaseYear: null, startInvestedCents: 1 })
    expect(screen.queryByText(/The balance you expect/)).toBeNull()
  })
})
