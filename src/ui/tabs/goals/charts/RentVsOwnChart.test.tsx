import { render, screen } from '@testing-library/react'
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

  it('counts the scenario\'s own upkeep against the buyer: a dearer house to keep leaves the buyer worse off', () => {
    const verdict = (homeCarryRate: number) => {
      const { unmount } = render(
        <RentVsOwnChart draft={draftOf({ housePriceCents: 40_000_000, rentMonthlyCents: 120_000, horizonYears: 30, homeCarryRate })} />,
      )
      const text = document.body.textContent ?? ''
      unmount()
      return text
    }
    // At no upkeep buying is ahead for longer than at 1,5%, which is longer than at 4%.
    const through = (text: string) => Number(text.match(/ahead through year (\d+)/)?.[1] ?? 0)
    expect(through(verdict(0))).toBeGreaterThan(through(verdict(0.015)))
    expect(through(verdict(0.015))).toBeGreaterThan(through(verdict(0.04)))
  })

  it('says who leads and from when, not that buying overtakes renting in the first year it draws level', () => {
    // A 400,000 house and 1,200 rent at the defaults: buying leads for four years, renting from the fifth.
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

    expect(screen.getByText(/Buying is ahead through year 4, then renting leads for the rest of the horizon, by .* after 30 years\./)).toBeInTheDocument()
    expect(screen.getByText(/before\s+the costs of selling/)).toBeInTheDocument()
    expect(screen.queryByText(/overtakes renting around year/)).not.toBeInTheDocument()
  })

  it('asks for a house price when there is none, with no lines to compare', () => {
    const { container } = render(<RentVsOwnChart draft={draftOf({ housePriceCents: 0 })} />)

    expect(screen.getByText(/Set a house price to compare renting against buying now/)).toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })
})
