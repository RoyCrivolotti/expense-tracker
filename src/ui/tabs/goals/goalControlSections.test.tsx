import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeverKey } from '../../../engine'
import { makeScenario } from '../../../testing/factories'
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
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })

  it('still says what the purchase takes from the portfolio when its year is in the bar', () => {
    // It is worked out from the draft and is said nowhere else, so it does not leave with the year.
    render(<HousingFields draft={makeDraft()} onChange={vi.fn()} omit={everything(['housePurchaseYear'])} />)
    expect(screen.queryByText('Purchase year')).not.toBeInTheDocument()
    expect(screen.getByText(/Purchase cost from portfolio/)).toBeInTheDocument()
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
