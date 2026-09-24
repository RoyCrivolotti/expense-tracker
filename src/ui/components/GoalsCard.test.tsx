import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GoalsCard } from './GoalsCard'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'

describe('GoalsCard', () => {
  it('renders empty state when no scenarios exist', () => {
    render(<GoalsCard dataset={makeDataset()} />)
    expect(screen.getByText(/Model multi-scenario wealth projections/i)).toBeInTheDocument()
  })

  it('asks for a plan to be chosen when scenarios exist but none is the plan', () => {
    const scenario = makeScenario({ id: 1, isActive: false })
    render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario] })} />)
    expect(screen.getByText(/pick one of your scenarios as your plan/i)).toBeInTheDocument()
  })

  it('renders scenario headline when a scenario is present', () => {
    const scenario = makeScenario({ id: 1, isActive: true, name: 'Test Plan' })
    render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario] })} />)
    expect(screen.getByRole('heading', { name: 'Goals', hidden: true })).toBeInTheDocument()
  })

  it('shows no track badge when there are no check-ins', () => {
    const scenario = makeScenario({ id: 1, isActive: true, planStartDate: '2024-01-01' })
    render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario] })} />)
    expect(screen.queryByText(/ahead|behind|on track/i)).not.toBeInTheDocument()
  })

  it('shows ahead badge when actual invested exceeds projection', () => {
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const scenario = makeScenario({ isActive: true,
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
    const scenario = makeScenario({ isActive: true,
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

  it('nudges for a check-in once the last one is a month old', () => {
    const onLogCheckin = vi.fn()
    const old = new Date()
    old.setDate(old.getDate() - 45)
    const dataset = makeDataset({
      goalScenarios: [makeScenario({ id: 1, isActive: true })],
      wealthAccounts: [makeWealthAccount({ id: 1 })],
      wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: old.toISOString().slice(0, 10) })],
    })
    render(<GoalsCard dataset={dataset} onLogCheckin={onLogCheckin} />)

    expect(screen.getByText(/Last check-in 4[45] days ago/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log check-in' }))
    expect(onLogCheckin).toHaveBeenCalled()
  })

  it('asks for the first check-in once there is an account, and not before', () => {
    const plan = makeScenario({ id: 1, isActive: true })
    const { rerender } = render(
      <GoalsCard dataset={makeDataset({ goalScenarios: [plan] })} onLogCheckin={vi.fn()} />,
    )
    expect(screen.queryByText(/check-in/)).not.toBeInTheDocument()

    rerender(
      <GoalsCard
        dataset={makeDataset({ goalScenarios: [plan], wealthAccounts: [makeWealthAccount({ id: 1 })] })}
        onLogCheckin={vi.fn()}
      />,
    )
    expect(screen.getByText('No check-in logged yet.')).toBeInTheDocument()
  })

  it('stays quiet after a recent check-in, and without a way to log one', () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 3)
    const dataset = makeDataset({
      goalScenarios: [makeScenario({ id: 1, isActive: true })],
      wealthAccounts: [makeWealthAccount({ id: 1 })],
      wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: recent.toISOString().slice(0, 10) })],
    })
    const { rerender } = render(<GoalsCard dataset={dataset} onLogCheckin={vi.fn()} />)
    expect(screen.queryByText(/Last check-in/)).not.toBeInTheDocument()

    const stale = new Date()
    stale.setDate(stale.getDate() - 90)
    rerender(
      <GoalsCard
        dataset={{ ...dataset, wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: stale.toISOString().slice(0, 10) })] }}
      />,
    )
    expect(screen.queryByText(/Last check-in/)).not.toBeInTheDocument()
  })

  it('renders an "Open Goals" link when onOpenGoals is provided', () => {
    const scenario = makeScenario({ id: 1, isActive: true })
    render(
      <GoalsCard
        dataset={makeDataset({ goalScenarios: [scenario] })}
        onOpenGoals={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Open Goals' })).toBeInTheDocument()
  })
})
