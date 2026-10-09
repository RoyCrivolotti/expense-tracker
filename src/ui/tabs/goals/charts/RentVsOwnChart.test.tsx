import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../../testing/factories'
import { RentVsOwnChart } from './RentVsOwnChart'

function draftOf(overrides: Parameters<typeof makeScenario>[0]) {
  const { id, isActive, ...draft } = makeScenario(overrides)
  void id
  void isActive
  return draft
}

describe('RentVsOwnChart', () => {
  it('says its two lines are the choices on their own, not the plan, so they are not compared with its net worth', () => {
    render(<RentVsOwnChart draft={draftOf({ housePriceCents: 400_000_000, rentMonthlyCents: 120_000 })} />)

    expect(screen.getByText(/without your starting portfolio and contributions, so they will not match the plan's net worth/)).toBeInTheDocument()
  })

  it('names the upkeep it assumes as the scenario\'s own, not a fixed one', () => {
    const { rerender } = render(<RentVsOwnChart draft={draftOf({ housePriceCents: 40_000_000, rentMonthlyCents: 120_000, homeCarryRate: 0.04 })} />)
    expect(screen.getByText(/upkeep, tax and insurance of 4,0% of the house's value a year/)).toBeInTheDocument()
    rerender(<RentVsOwnChart draft={draftOf({ housePriceCents: 40_000_000, rentMonthlyCents: 120_000, homeCarryRate: 0 })} />)
    expect(screen.getByText(/upkeep, tax and insurance of 0,0% of the house's value a year/)).toBeInTheDocument()
    expect(screen.queryByText(/1\.5%/)).not.toBeInTheDocument()
  })

  it('counts the scenario\'s own upkeep against the buyer: a dearer house to keep lets renting overtake sooner', () => {
    const headline = (homeCarryRate: number) => {
      const { unmount } = render(
        <RentVsOwnChart draft={draftOf({ housePriceCents: 40_000_000, rentMonthlyCents: 120_000, horizonYears: 30, homeCarryRate })} />,
      )
      const text = document.body.textContent ?? ''
      unmount()
      return text
    }
    // How long renting takes to overtake, from the sentence at the top: never, or after some years, or from the start.
    const leads = (text: string) => {
      if (text.includes('Buying stays ahead of renting the whole way')) return Number.POSITIVE_INFINITY
      return Number(text.match(/Renting overtakes buying (\d+) years/)?.[1] ?? 0)
    }
    expect(leads(headline(0))).toBeGreaterThan(leads(headline(0.015)))
    expect(leads(headline(0.015))).toBeGreaterThan(leads(headline(0.04)))
  })

  it('says who leads and from when, not that buying overtakes renting in the first year it draws level', () => {
    // A 400,000 house and 1,200 rent at the defaults: buying leads through the fourth year, renting from the fifth.
    render(
      <RentVsOwnChart
        draft={draftOf({
          housePriceCents: 40_000_000,
          rentMonthlyCents: 120_000,
          downPaymentFraction: 0.2,
          transactionCostsCents: 50_000,
          mortgageRateAnnual: 0.03,
          mortgageTermYears: 30,
          houseAppreciationRate: 0.025,
          expectedRealReturn: 0.07,
          horizonYears: 30,
        })}
      />,
    )

    expect(screen.getByText(/Renting overtakes buying 5 years after you buy and stays ahead to the end, by .* after 40 years\./)).toBeInTheDocument()
    expect(screen.getByText(/no costs of selling/)).toBeInTheDocument()
    expect(screen.queryByText(/overtakes renting around year/)).not.toBeInTheDocument()
  })

  it('asks for a house price when there is none, with no lines to compare', () => {
    const { container } = render(<RentVsOwnChart draft={draftOf({ housePriceCents: 0 })} />)

    expect(screen.getByText(/Set a house price to compare renting against buying/)).toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })

  it('names its two lines and where each starts, so the chart says what it is drawing', () => {
    render(<RentVsOwnChart draft={draftOf({ housePriceCents: 30_000_000, rentMonthlyCents: 100_000, downPaymentFraction: 0.2, transactionCostsCents: 600_000, housePurchaseYear: null })} />)
    expect(screen.getByText('Renter: money invested (starts at 66k €)')).toBeInTheDocument()
    expect(screen.getByText('Buyer: house less loan, plus savings (starts at 60k €)')).toBeInTheDocument()
  })

  it('names the loan being paid off on the chart, and when owning gets cheaper than renting', () => {
    render(<RentVsOwnChart draft={draftOf({ housePriceCents: 30_000_000, rentMonthlyCents: 150_000, mortgageTermYears: 20 })} />)
    expect(screen.getByText('Loan paid off')).toBeInTheDocument()
    expect(screen.getByText(/Owning (first )?cheaper/)).toBeInTheDocument()
  })

  it('says what each side holds and invests a month when a year is picked', () => {
    const { container } = render(<RentVsOwnChart draft={draftOf({ housePriceCents: 30_000_000, rentMonthlyCents: 100_000 })} />)
    const svg = container.querySelector('svg[role="img"]')!
    fireEvent.keyDown(svg, { key: 'Home' })
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('1 year after buying')
    expect(tip).toHaveTextContent('Renter total')
    expect(tip).toHaveTextContent('Buyer: loan left')
    expect(tip).toHaveTextContent('Buyer invests a month')
  })

  it('begins at the purchase year when the plan buys later, and says so', () => {
    render(<RentVsOwnChart draft={draftOf({ housePriceCents: 30_000_000, rentMonthlyCents: 100_000, housePurchaseYear: 8 })} />)
    expect(screen.getByText(/Compared from year 8 of the plan, when it buys/)).toBeInTheDocument()
  })
})
