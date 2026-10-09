import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeverKey } from '../../../engine'
import { makeScenario } from '../../../testing/factories'
import { samplePlan } from '../../../testing/samplePlan'
import { FireFields, HousingFields, PortfolioFields } from './goalControlSections'
import { LEVER_SPECS, SECTION_KEYS } from './leverFields'

function makeDraft() {
  const { id, ...rest } = makeScenario({ housePurchaseYear: 5, transactionCostsCents: 50_000 })
  void id
  return rest
}

const everything = (keys: readonly LeverKey[]) => new Set(keys)

describe('the sections of the controls', () => {
  it('shows every input of a section when none is in the bar', () => {
    render(
      <>
        <PortfolioFields draft={makeDraft()} onChange={vi.fn()} />
        <HousingFields draft={makeDraft()} onChange={vi.fn()} />
        <FireFields draft={makeDraft()} onChange={vi.fn()} />
      </>,
    )
    for (const key of [...SECTION_KEYS.portfolio, ...SECTION_KEYS.fire]) {
      expect(screen.getAllByLabelText(LEVER_SPECS[key].label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Purchase year')).toBeInTheDocument()
    expect(screen.getByText(/Purchase cost from portfolio/)).toBeInTheDocument()
  })

  it('leaves out the inputs that are in the bar, with the hints that explain only them', () => {
    const omit = everything([...SECTION_KEYS.portfolio, ...SECTION_KEYS.housing, ...SECTION_KEYS.fire])
    const { container } = render(
      <>
        <PortfolioFields draft={makeDraft()} onChange={vi.fn()} omit={omit} />
        <HousingFields draft={makeDraft()} onChange={vi.fn()} omit={omit} />
        <FireFields draft={makeDraft()} onChange={vi.fn()} omit={omit} />
      </>,
    )
    expect(screen.queryByLabelText('Monthly investing')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Withdrawal rate at FI')).not.toBeInTheDocument()
    expect(screen.queryByText('Purchase year')).not.toBeInTheDocument()
    expect(screen.queryByText(/Notary, agency/)).not.toBeInTheDocument()
    expect(screen.queryByText(/nominal, as a bank/)).not.toBeInTheDocument()
    expect(screen.queryByText(/FI target = annual spend/)).not.toBeInTheDocument()
    // What is about the section as a whole stays.
    expect(screen.getByText(/Models life after financial independence/)).toBeInTheDocument()
    // Every input that can be in the bar is out of the sections; the upkeep of the house is not one of
    // them (it has no star), so it is the only thing left.
    const left = [...container.querySelectorAll('input')].filter((i) => !i.getAttribute('aria-label')?.startsWith('Upkeep'))
    expect(left).toHaveLength(0)
  })

  it('says what return to expect beside the real return, and keeps saying it when the return is in the bar', () => {
    const { rerender } = render(<PortfolioFields draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText(/Real return: about 5% a year after inflation/)).toBeInTheDocument()
    expect(screen.getByText(/6 to 7% is optimistic/)).toBeInTheDocument()

    // Said nowhere else, so it does not leave with the input.
    rerender(<PortfolioFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['expectedRealReturn'])} />)
    expect(screen.queryByLabelText(LEVER_SPECS.expectedRealReturn.label)).not.toBeInTheDocument()
    expect(screen.getByText(/Real return: about 5% a year after inflation/)).toBeInTheDocument()
  })

  it('still says what the purchase takes from the portfolio when its year is in the bar', () => {
    // It is worked out from the draft and is said nowhere else, so it does not leave with the year.
    render(<HousingFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['housePurchaseYear'])} />)
    expect(screen.queryByText('Purchase year')).not.toBeInTheDocument()
    expect(screen.getByText(/Purchase cost from portfolio/)).toBeInTheDocument()
  })

  it('says what the house costs when it is bought, under the price, and keeps saying it when the price is in the bar', () => {
    const { id, ...draft } = samplePlan()
    void id
    const { rerender } = render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/Enter today's price\. Bought in year 8 it costs about 324\.353 € in 2026 euros/)).toBeInTheDocument()

    // It is worked out from the draft and said nowhere else, so it does not leave with the input.
    rerender(<HousingFields draft={draft} onChange={vi.fn()} omit={everything(['housePriceCents'])} />)
    expect(screen.queryByLabelText('House price')).not.toBeInTheDocument()
    expect(screen.getByText(/Enter today's price\. Bought in year 8/)).toBeInTheDocument()
  })

  it('takes what the purchase costs from the price it has risen to', () => {
    // 20% of 324.353,02 in 2026 euros, and the 6.000 of fees.
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/Purchase cost from portfolio: 64\.870,56 € down \+ 6\.000,00 € fees = 70\.870,56 €/)).toBeInTheDocument()
  })

  it('has the yearly upkeep of the house, which Rent vs buy counts, beside the rent, and writes an edit to the draft', () => {
    const onChange = vi.fn()
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={onChange} />)

    expect(screen.getAllByLabelText('Upkeep, tax and insurance (%/yr)').length).toBeGreaterThan(0)
    expect(screen.getByText(/What owning costs a year beyond the mortgage/)).toBeInTheDocument()
    expect(screen.getByText(/Rent vs buy counts it against buying/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^Increase Upkeep, tax and insurance/ })[0]!)
    const patch = onChange.mock.calls[0]?.[0] as { homeCarryRate: number } | undefined
    expect(patch?.homeCarryRate).toBeGreaterThan(draft.homeCarryRate)
  })

  it('shows the upkeep even with no house planned, since Rent vs buy compares buying today', () => {
    const never = makeScenario({ housePurchaseYear: null })
    const { id, ...rest } = never
    void id
    render(<HousingFields draft={rest} onChange={vi.fn()} />)
    expect(screen.getAllByLabelText('Upkeep, tax and insurance (%/yr)').length).toBeGreaterThan(0)
  })

  it('says what already owning the house means for the starting balance, which the year alone does not', () => {
    const now = makeScenario({ housePurchaseYear: 0 })
    const { id, ...rest } = now
    void id
    render(<HousingFields draft={rest} onChange={vi.fn()} />)

    expect(screen.getByText(/Already own: the starting balance is counted as what is left after the/)).toBeInTheDocument()
    expect(screen.queryByText(/Purchase cost from portfolio/)).not.toBeInTheDocument()
  })

  it('says nothing about a purchase when there is none', () => {
    const never = makeScenario({ housePurchaseYear: null })
    const { id, ...rest } = never
    void id
    render(<HousingFields draft={rest} onChange={vi.fn()} />)

    expect(screen.queryByText(/Already own:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Purchase cost from portfolio/)).not.toBeInTheDocument()
  })

  it('writes an edit to the withdrawal rate to the draft', () => {
    const onChange = vi.fn()
    render(<FireFields draft={makeDraft()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /^Increase / }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const patch = onChange.mock.calls[0]?.[0] as { safeWithdrawalRate: number } | undefined
    expect(patch?.safeWithdrawalRate).toBeGreaterThan(makeDraft().safeWithdrawalRate)
  })

  it('keeps the other inputs of a section when one is in the bar', () => {
    render(<PortfolioFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['horizonYears'])} />)
    expect(screen.queryByLabelText('Horizon (years)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Starting invested')).toBeInTheDocument()
  })
})
