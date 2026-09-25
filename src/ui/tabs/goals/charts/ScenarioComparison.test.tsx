import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioComparison } from './ScenarioComparison'
import { comparisonRows } from './comparisonRows'
import { makeScenario } from '../../../../testing/factories'
import { EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE } from '../../../../engine'

const { id, isActive, ...draft } = makeScenario({ name: 'Path D: Draft', housePurchaseYear: null })
void id
void isActive

describe('comparisonRows', () => {
  it('has a row per saved scenario plus the draft, with the end-of-horizon figures', () => {
    const rows = comparisonRows(
      [
        makeScenario({ id: 1, name: 'Path A: Invest only', housePurchaseYear: null, horizonYears: 30 }),
        makeScenario({ id: 2, name: 'Path B: House now', housePurchaseYear: 0 }),
        makeScenario({ id: 3, name: 'Path C: Buy in year 5', housePurchaseYear: 5 }),
      ],
      draft,
      EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE,
    )
    expect(rows.map((r) => r.name)).toEqual(['Path A', 'Path B', 'Path C', 'Path D (editing)'])
    expect(rows.map((r) => r.house)).toEqual(['never', 'now', 'year 5', 'never'])
    expect(rows[0]!.netWorth).toMatch(/€$/)
    expect(rows[0]!.horizonYears).toBe(30)
    expect(rows[0]!.fi).toMatch(/^(now|year \d+|not in horizon)$/)
  })

  it('leaves the draft out when told it is a loaded scenario with no edits', () => {
    const saved = makeScenario({ id: 1, name: 'Path A: Invest only' })
    const { id: savedId, isActive: active, ...asDraft } = saved
    void savedId
    void active
    const rows = comparisonRows([saved], asDraft, EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE, false)
    expect(rows.map((r) => r.name)).toEqual(['Path A'])
  })

  it('reads net worth and invested at a chosen year, or at a shorter horizon', () => {
    const long = makeScenario({ id: 1, name: 'Long', horizonYears: 30, housePurchaseYear: null })
    const short = makeScenario({ id: 2, name: 'Short', horizonYears: 8, housePurchaseYear: null })
    const rows = comparisonRows([long, short], draft, EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE, false, 10)
    expect(rows.map((r) => r.atYear)).toEqual([10, 8])
    // Year 10 of a growing plan is less than its year 30.
    const atHorizon = comparisonRows([long], draft, EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE, false)
    expect(atHorizon[0]!.atYear).toBe(30)
    expect(rows[0]!.invested).not.toBe(atHorizon[0]!.invested)
  })

  it('says when FI is not reached within the horizon', () => {
    const rows = comparisonRows(
      [],
      { ...draft, annualSpendCents: 900_000_00, safeWithdrawalRate: 0.03, horizonYears: 5 },
      EU_MONEY_FORMAT, DEFAULT_INFLATION_RATE,
    )
    expect(rows[0]!.fi).toBe('not in horizon')
  })
})

describe('ScenarioComparison', () => {
  it('renders the table with one row per path', () => {
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Path A: Invest only' })]}
        draft={draft}
      />,
    )
    expect(screen.getByText('Scenarios side by side')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Path D (editing)')).toBeInTheDocument()
    expect(screen.getByText(/after 30 years/)).toBeInTheDocument()
  })

  it('shows a loaded, unchanged scenario once, as the chart does', () => {
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Path A: Invest only' })]}
        draft={draft}
        includeDraft={false}
      />,
    )
    // The header row and the one scenario: no "(editing)" twin of it.
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.queryByText(/\(editing\)/)).not.toBeInTheDocument()
  })

  it('says the figures are in today\'s money, as the whole plan is', () => {
    render(<ScenarioComparison scenarios={[]} draft={draft} />)
    expect(screen.getByText(/in today's money/)).toBeInTheDocument()
  })

  it('keeps two scenarios with the same short name apart', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Path: A' }), makeScenario({ id: 2, name: 'Path: B' })]}
        draft={draft}
      />,
    )
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('offers the hero chart\'s windows and reads the table at the chosen one', () => {
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Path A: Invest only', horizonYears: 30 })]}
        draft={draft}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Comparison year' })
    expect(group).toHaveTextContent('5Y10Y20YHorizon')
    expect(screen.getByRole('radio', { name: 'Horizon' })).toBeChecked()
    expect(screen.getByText(/after 30 years/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '10Y' }))
    expect(screen.getByText(/after 10 years/)).toBeInTheDocument()
  })

  it('marks a path whose horizon is shorter than the chosen year', () => {
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Short', horizonYears: 8 })]}
        draft={{ ...draft, horizonYears: 30 }}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '20Y' }))
    expect(screen.getByText(/after 20 years, or at a path’s horizon when it is shorter/)).toBeInTheDocument()
    expect(screen.getAllByText(/\(8y\)$/)).toHaveLength(2)
    expect(screen.getAllByText(/\(20y\)$/)).toHaveLength(2)
  })

  it('marks each row with its own horizon when they differ', () => {
    render(
      <ScenarioComparison
        scenarios={[makeScenario({ id: 1, name: 'Short', horizonYears: 10 })]}
        draft={{ ...draft, horizonYears: 30 }}
      />,
    )
    expect(screen.getByText(/at each path’s horizon/)).toBeInTheDocument()
    expect(screen.getAllByText(/\(10y\)$/)).toHaveLength(2)
    expect(screen.getAllByText(/\(30y\)$/)).toHaveLength(2)
  })
})
