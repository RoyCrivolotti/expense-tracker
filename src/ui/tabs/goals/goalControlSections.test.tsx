import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeverKey } from '../../../engine'
import { makeScenario } from '../../../testing/factories'
import { samplePlan } from '../../../testing/samplePlan'
import { ChangesFields, EventsFields, FireFields, HousingFields, PortfolioFields } from './goalControlSections'
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
    expect(screen.getByText(/takes .* from the portfolio/)).toBeInTheDocument()
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
    // Every input that can be in the bar is out of the sections; the upkeep of the house and the years
    // the money must last are not among them (neither has a star), so they are all that is left.
    const left = [...container.querySelectorAll('input')].filter((i) => !/^(Upkeep|Years the money)/.test(i.getAttribute('aria-label') ?? ''))
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

  it('says to enter the rate the money compounds at, not the average of yearly returns, and that fund costs and tax are not taken out', () => {
    render(<PortfolioFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['expectedRealReturn'])} />)
    const note = screen.getByText(/Real return: about 5% a year after inflation/)
    expect(note).toHaveTextContent('Enter the rate your money compounds at, not the simple average of yearly returns, which is higher by about a point for stocks.')
    expect(note).toHaveTextContent('The plan takes out no fund costs or tax, so enter the return after them.')
  })

  it('still says what the purchase takes from the portfolio when its year is in the bar', () => {
    // It is worked out from the draft and is said nowhere else, so it does not leave with the year.
    render(<HousingFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['housePurchaseYear'])} />)
    expect(screen.queryByText('Purchase year')).not.toBeInTheDocument()
    expect(screen.getByText(/takes .* from the portfolio/)).toBeInTheDocument()
  })

  it('keeps the Housing hints short, the caveat that the loan and upkeep are not taken from the portfolio in view, and the rest behind a closed note', () => {
    const { id, ...draft } = samplePlan()
    void id
    const { container } = render(<HousingFields draft={draft} onChange={vi.fn()} />)
    const details = container.querySelector('details')!
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')).toHaveTextContent('How these are counted')
    // What is behind the note: how each figure was counted.
    expect(details).toHaveTextContent('When you pay it that is about')
    expect(details).toHaveTextContent('Fees are notary, agency and closing costs')
    expect(details).toHaveTextContent(/nominal, as a bank and the price index quote them/)
    // What is in view: short, and the caveat that stops a wrong plan.
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelector('details')!.remove()
    const prose = [...clone.querySelectorAll('p')].map((p) => p.textContent ?? '').join(' ')
    expect(prose.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(95)
    expect(prose).toContain('The loan and upkeep come from your income instead')
    expect(prose).toContain('Enter both as quoted, before inflation. The plan takes inflation off.')
    expect(prose).toContain('1 to 2% is usual.')
  })

  it('names the money the saved life events are in, once, under the list', () => {
    const { id, ...draft } = samplePlan({ lifeEvents: [{ year: 5, amountCents: 1_000_000, label: 'Inheritance' }] })
    void id
    const { rerender } = render(<EventsFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText('Amounts in 2026 euros.')).toBeInTheDocument()
    rerender(<EventsFields draft={{ ...draft, lifeEvents: [] }} onChange={vi.fn()} />)
    expect(screen.queryByText(/^Amounts in/)).not.toBeInTheDocument()
  })

  it('says what the house costs when it is bought, under the price, and keeps saying it when the price is in the bar', () => {
    const { id, ...draft } = samplePlan()
    void id
    const { rerender } = render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/Enter the price at the plan's start\. Bought in year 8 it costs about 324\.353 € in 2026 euros/)).toBeInTheDocument()

    // It is worked out from the draft and said nowhere else, so it does not leave with the input.
    rerender(<HousingFields draft={draft} onChange={vi.fn()} omit={everything(['housePriceCents'])} />)
    expect(screen.queryByLabelText('House price')).not.toBeInTheDocument()
    expect(screen.getByText(/Enter the price at the plan's start\. Bought in year 8/)).toBeInTheDocument()
  })

  it('says what the rent comes to on the account in the year the house is bought, under the rent', () => {
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(
      screen.getByText('Counted in 2026 euros and rising with inflation: about 1.172 € a month on your account in 2034, the year you buy.'),
    ).toBeInTheDocument()
  })

  it('says what the spending comes to on the account where the plan reaches FI or ends, under the spending, and not once it is in the bar', () => {
    const { id, ...draft } = samplePlan()
    void id
    const { rerender } = render(<FireFields draft={draft} onChange={vi.fn()} />)
    expect(
      screen.getByText('Counted in 2026 euros: about 54.341 € a year on your account in 2056, when the plan ends (FI is not reached).'),
    ).toBeInTheDocument()

    rerender(<FireFields draft={draft} onChange={vi.fn()} omit={everything(['annualSpendCents'])} />)
    expect(screen.queryByText(/^Counted in 2026 euros: about/)).not.toBeInTheDocument()
  })

  it('says which euros the monthly amount is counted in, and that what you send counts for less each year', () => {
    const { id, ...draft } = samplePlan()
    void id
    render(<ChangesFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/It is counted in 2026 euros at the assumed inflation, so an amount that stays the same counts for less each year/)).toBeInTheDocument()
  })

  it('takes what the purchase costs from the price it has risen to', () => {
    // 20% of 324.353,02 in 2026 euros, and the 6.000 of fees.
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(
      screen.getByText(
        'Year 8 takes 70.871 € from the portfolio: 64.871 € down + 6.000 € fees, in 2026 euros (about 83.036 € on your account in 2034). The loan and upkeep come from your income instead: if that lowers what you invest, add a change under Monthly investing over time.',
      ),
    ).toBeInTheDocument()
  })

  it('says the same for a house you already own, which the plan does not charge the portfolio for either', () => {
    const { id, ...draft } = samplePlan({ housePurchaseYear: 0 })
    void id
    render(<HousingFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/^Already own: the starting balance is counted as what is left after/)).toHaveTextContent(
      'The loan and upkeep come from your income instead: if that lowers what you invest, add a change under Monthly investing over time.',
    )
  })

  it('says what the fees come to on the account in the year the house is bought, under the fees', () => {
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={vi.fn()} />)
    // 6.000 euros of 2026 times 1,02 to the 8th.
    expect(screen.getByText('Counted in 2026 euros: about 7.030 € on your account in 2034, the year you buy.')).toBeInTheDocument()
  })

  it('names the money of the amounts that are typed for a one-off event, and what the one being added comes to on the account', () => {
    const { id, ...draft } = samplePlan()
    void id
    render(<EventsFields draft={draft} onChange={vi.fn()} />)
    expect(screen.getByText(/Amounts are counted in 2026 euros, like the rest of the plan/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Add life event' }))
    // The form starts at year 1 and 1.000.000 euros: 1.020.000 on the account a year on.
    expect(screen.getByText('Counted in 2026 euros: about 1.020.000 € on your account in 2027.')).toBeInTheDocument()
  })

  it('has the yearly upkeep of the house, which Rent vs buy counts, beside the rent, and writes an edit to the draft', () => {
    const onChange = vi.fn()
    const { id, ...draft } = samplePlan()
    void id
    render(<HousingFields draft={draft} onChange={onChange} />)

    expect(screen.getAllByLabelText('Upkeep, tax and insurance (%/yr)').length).toBeGreaterThan(0)
    expect(screen.getByText(/what owning costs a year beyond the mortgage/i)).toBeInTheDocument()
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
    expect(screen.queryByText(/takes .* from the portfolio/)).not.toBeInTheDocument()
  })

  it('says nothing about a purchase when there is none', () => {
    const never = makeScenario({ housePurchaseYear: null })
    const { id, ...rest } = never
    void id
    render(<HousingFields draft={rest} onChange={vi.fn()} />)

    expect(screen.queryByText(/Already own:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/takes .* from the portfolio/)).not.toBeInTheDocument()
  })

  it('writes an edit to the withdrawal rate to the draft', () => {
    const onChange = vi.fn()
    render(<FireFields draft={makeDraft()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /^Increase Withdrawal rate at FI/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const patch = onChange.mock.calls[0]?.[0] as { safeWithdrawalRate: number } | undefined
    expect(patch?.safeWithdrawalRate).toBeGreaterThan(makeDraft().safeWithdrawalRate)
  })

  it('has the years the money must last, with the guide for them, even when the withdrawal rate is in the bar', () => {
    render(<FireFields draft={{ ...makeDraft(), retirementYears: 40 }} onChange={vi.fn()} omit={everything(SECTION_KEYS.fire)} />)
    expect(screen.getAllByLabelText('Years the money must last').length).toBeGreaterThan(0)
    expect(screen.getByText(/the usual guide is 4% up to 35 years, 3,5% up to 49 and 3,25% from 50, so 40 years points to 3,5%/)).toBeInTheDocument()
    expect(screen.getByText(/moves the rate to the guide unless you have set the rate yourself/)).toBeInTheDocument()
  })

  it('calls the guide a rule of thumb, not a safe rate, and points to the chart that shows how often the money lasts', () => {
    render(<FireFields draft={{ ...makeDraft(), retirementYears: 30 }} onChange={vi.fn()} omit={everything(SECTION_KEYS.fire)} />)
    const hint = screen.getByText(/How long the invested money has to pay for your spending after FI/)
    expect(hint).toHaveTextContent('The longer, the lower the withdrawal rate has to be: the usual guide is 4% up to 35 years, 3,5% up to 49 and 3,25% from 50, so 30 years points to 4%.')
    expect(hint).toHaveTextContent('It is a rule of thumb, not a promise: the FI chart shows how often the money lasts in simulated markets.')
    expect(hint).not.toHaveTextContent('that is safe')
  })

  it('says to add the tax on what is withdrawn, since the plan does not, under the spending', () => {
    render(<FireFields draft={makeDraft()} onChange={vi.fn()} />)
    expect(screen.getByText(/Yearly cost of living you would need the portfolio to cover after FI/)).toHaveTextContent('Add the tax on what you withdraw: the plan does not.')
  })

  it('moves the withdrawal rate with the years while it is the guide, and leaves one set by hand alone', () => {
    const years = (draft: ReturnType<typeof makeDraft>) => {
      const onChange = vi.fn()
      const { unmount } = render(<FireFields draft={draft} onChange={onChange} />)
      fireEvent.click(screen.getAllByRole('button', { name: /^Increase Years the money must last/ })[0]!)
      unmount()
      return onChange.mock.calls[0]?.[0] as { retirementYears: number; safeWithdrawalRate?: number }
    }
    // 35 years at 4% is the guide, so 36 years brings 3,5% with it.
    expect(years({ ...makeDraft(), retirementYears: 35, safeWithdrawalRate: 0.04 })).toEqual({ retirementYears: 36, safeWithdrawalRate: 0.035 })
    // A rate set by hand stays.
    expect(years({ ...makeDraft(), retirementYears: 35, safeWithdrawalRate: 0.045 })).toEqual({ retirementYears: 36 })
  })

  it('keeps the other inputs of a section when one is in the bar', () => {
    render(<PortfolioFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['horizonYears'])} />)
    expect(screen.queryByLabelText('Horizon (years)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Starting invested')).toBeInTheDocument()
  })
})
