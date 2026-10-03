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

  it('asks for a house price when there is none, with no lines to compare', () => {
    const { container } = render(<RentVsOwnChart draft={draftOf({ housePriceCents: 0 })} />)

    expect(screen.getByText(/Set a house price to compare renting against buying now/)).toBeInTheDocument()
    expect(container.querySelector('svg[role="img"]')).toBeNull()
  })
})
