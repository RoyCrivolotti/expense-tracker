import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../testing/factories'
import { AssumedInflationContext } from '../../hooks/assumedInflationContext'
import { PortfolioShortfallNote } from './PortfolioShortfallNote'

// A 400.000 € house takes 80.000 € down. With 20.000 € and 500 € a month the portfolio holds about 62.500 € by year 5.
// Its price stays put (no rise, no inflation) so the figures read plainly; the last test lets it rise.
const house = { housePriceCents: 40_000_000, houseAppreciationRate: 0, horizonYears: 10 }
const thin = makeScenario({
  ...house,
  startInvestedCents: 2_000_000,
  monthlyContributionCents: 50_000,
  housePurchaseYear: 5,
})

const renderNote = (draft = thin) =>
  render(
    <AssumedInflationContext.Provider value={0}>
      <PortfolioShortfallNote draft={draft} />
    </AssumedInflationContext.Provider>,
  )

describe('PortfolioShortfallNote', () => {
  it('says nothing for a plan whose portfolio covers what comes out of it', () => {
    renderNote(makeScenario({ ...house, startInvestedCents: 20_000_000, housePurchaseYear: 3 }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says nothing for a plan that never buys', () => {
    renderNote(makeScenario({ housePurchaseYear: null }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('names the year the house does not fit, what it takes out and how far below zero that leaves the portfolio', () => {
    renderNote()
    const note = screen.getByRole('status')
    expect(note.textContent).toContain('The house needs more than the portfolio holds in year 5.')
    expect(note.textContent).toContain('It takes 80.000 € out (the down payment and the costs)')
    expect(note.textContent).toMatch(/Figures are in (\d{4}|today's) euros\./)
    expect(note.textContent).toMatch(/leaves the portfolio 17\.\d{3} € below zero\./)
    expect(note.textContent).toContain('not a plan you could follow')
    expect(note.textContent).toContain('Buy later, put less down or invest more first.')
  })

  it('counts the purchase costs with the down payment', () => {
    renderNote({ ...thin, transactionCostsCents: 500_000 })
    expect(screen.getByRole('status').textContent).toContain('It takes 85.000 € out')
  })

  it('takes the down payment from the price the house has risen to by the year it is bought', () => {
    // 400.000 € today at 2.5% a year with no inflation is 452.563 € in year 5, so 90.513 € down.
    renderNote({ ...thin, houseAppreciationRate: 0.025 })
    expect(screen.getByRole('status').textContent).toContain('It takes 90.513 € out')
  })

  it('blames a life event when the house alone fits', () => {
    renderNote(
      makeScenario({
        ...house,
        startInvestedCents: 20_000_000,
        housePurchaseYear: 3,
        lifeEvents: [{ year: 3, amountCents: -30_000_000, label: 'Renovation' }],
      }),
    )
    const note = screen.getByRole('status')
    expect(note.textContent).toContain('A life event takes the portfolio below zero in year 3.')
    expect(note.textContent).toMatch(/The portfolio ends that year \d{2}\.\d{3} € below zero\./)
    expect(note.textContent).toContain('Move the event, make it smaller or invest more first.')
  })

  it('goes away when the draft is changed so the portfolio covers it', () => {
    const { rerender } = renderNote()
    expect(screen.getByRole('status')).toBeTruthy()

    rerender(
      <AssumedInflationContext.Provider value={0}>
        <PortfolioShortfallNote draft={{ ...thin, housePurchaseYear: 15 }} />
      </AssumedInflationContext.Provider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
