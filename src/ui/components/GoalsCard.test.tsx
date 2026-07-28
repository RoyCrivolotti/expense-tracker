import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GoalsCard } from './GoalsCard'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'

describe('GoalsCard', () => {
  it('renders empty state when no scenarios exist', () => {
    render(<GoalsCard dataset={makeDataset()} />)
    expect(screen.getByText(/Model multi-scenario wealth projections/i)).toBeInTheDocument()
  })

  it('renders scenario headline when a scenario is present', () => {
    const scenario = makeScenario({ id: 1, name: 'Test Plan' })
    render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario] })} />)
    expect(screen.getByRole('heading', { name: 'Goals', hidden: true })).toBeInTheDocument()
  })

  it('shows no track badge when there are no check-ins', () => {
    const scenario = makeScenario({ id: 1, planStartDate: '2024-01-01' })
    render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario] })} />)
    expect(screen.queryByText(/ahead|behind|on track/i)).not.toBeInTheDocument()
  })

  it('shows ahead badge when actual invested exceeds projection', () => {
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const scenario = makeScenario({
      id: 1,
      planStartDate: '2024-01-01',
      startInvestedCents: 1_000_000,
      monthlyContributionCents: 10_000,
      expectedRealReturn: 0.07,
    })
    // Check-in with a very high actual value — should be well ahead
    const checkin = makeWealthCheckin({
      id: 1,
      checkinDate: '2024-07-01',
      entries: [{ accountId: 1, valueCents: 50_000_000 }],
    })
    render(
      <GoalsCard
        dataset={makeDataset({
          goalScenarios: [scenario],
          wealthAccounts: [account],
          wealthCheckins: [checkin],
        })}
      />,
    )
    expect(screen.getByText(/ahead|on track/i)).toBeInTheDocument()
  })

  it('shows behind badge when actual invested is below projection', () => {
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const scenario = makeScenario({
      id: 1,
      planStartDate: '2020-01-01',
      startInvestedCents: 100_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.07,
    })
    // Check-in with almost zero — should be well behind
    const checkin = makeWealthCheckin({
      id: 1,
      checkinDate: '2024-07-01',
      entries: [{ accountId: 1, valueCents: 100_000 }],
    })
    render(
      <GoalsCard
        dataset={makeDataset({
          goalScenarios: [scenario],
          wealthAccounts: [account],
          wealthCheckins: [checkin],
        })}
      />,
    )
    expect(screen.getByText(/behind/i)).toBeInTheDocument()
  })

  it('renders an "Open Goals" link when onOpenGoals is provided', () => {
    const scenario = makeScenario({ id: 1 })
    render(
      <GoalsCard
        dataset={makeDataset({ goalScenarios: [scenario] })}
        onOpenGoals={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Open Goals' })).toBeInTheDocument()
  })
})
