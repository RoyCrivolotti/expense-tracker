import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FixedCostItem } from '../../../engine'
import { FixedCostsCard } from './FixedCostsCard'

const rent: FixedCostItem = {
  key: 'rent|1|1',
  kind: 'pattern',
  name: 'Rent',
  amountCents: 100_000,
  frequency: 'monthly',
  lastMonth: '2026-03',
  payment: null,
  inPaceBudget: true,
}

describe('FixedCostsCard', () => {
  it('lists each detected cost with its rhythm, last charge and whether the pace budget takes it', () => {
    render(
      <FixedCostsCard
        items={[
          rent,
          { ...rent, key: 'ins', name: 'Insurance', frequency: 'quarterly', amountCents: 24_000, inPaceBudget: false },
          { ...rent, key: 'plan-1', kind: 'instalment', name: 'Phone', amountCents: 4_000, lastMonth: null, payment: { index: 10, total: 24 } },
        ]}
      />,
    )
    expect(screen.getByText('Detected fixed costs (3)')).toBeInTheDocument()
    expect(screen.getByText(/monthly, last charged/)).toBeInTheDocument()
    expect(screen.getByText(/every 3 months, last charged/)).toBeInTheDocument()
    expect(screen.getByText('instalment 10 of 24')).toBeInTheDocument()
    expect(screen.getAllByText('in the budget')).toHaveLength(2)
    expect(screen.getByText(/has not repeated 3 times at a regular rhythm yet/)).toBeInTheDocument()
  })

  it('shows nothing when no fixed cost has been detected', () => {
    const { container } = render(<FixedCostsCard items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
