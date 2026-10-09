import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GoalsCard } from './GoalsCard'
import { DEFAULT_INFLATION_RATE, planValueAtDate, realToNominal } from '../../engine'
import { makeDataset, makeScenario, makeTransaction, makeWealthAccount, makeWealthCheckin } from '../../testing/factories'
import { samplePlan } from '../../testing/samplePlan'

/** The local calendar date `n` days ago; the card counts days in local time too. */
function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

  it('sets the pace kept on whole months, leaving the month under way out', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 10, 12))
    try {
      const scenario = makeScenario({ id: 1, isActive: true, planStartDate: '2026-01-01', monthlyContributionCents: 100_000 })
      const invest = (id: number, month: string, amountCents: number) =>
        makeTransaction({ id, type: 'investment', budgetMonth: month, date: `${month}-10`, amountCents })
      // 1.200 a month for three months and 100 so far in April, which is still under way.
      const transactions = [
        invest(1, '2026-01', 120_000),
        invest(2, '2026-02', 120_000),
        invest(3, '2026-03', 120_000),
        invest(4, '2026-04', 10_000),
      ]
      render(<GoalsCard dataset={makeDataset({ goalScenarios: [scenario], transactions })} />)
      expect(screen.getByText(/actual avg 1\.200,00 €\/mo invested/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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

  describe('the track badge', () => {
    const account = makeWealthAccount({ id: 1, kind: 'investment' })
    const scenario = makeScenario({
      isActive: true,
      id: 1,
      planStartDate: '2020-01-01',
      startInvestedCents: 0,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.07,
      horizonYears: 30,
    })
    const date = '2025-06-01'
    const badge = (balanceCents: number) => {
      render(
        <GoalsCard
          dataset={makeDataset({
            goalScenarios: [scenario],
            wealthAccounts: [account],
            wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: date, entries: [{ accountId: 1, valueCents: balanceCents }] })],
          })}
        />,
      )
    }
    const nominalWithGap = (gapCents: number) =>
      realToNominal(planValueAtDate(scenario, date, DEFAULT_INFLATION_RATE)! + gapCents, '2020-01-01', date, DEFAULT_INFLATION_RATE)

    it('counts months along the plan line', () => {
      badge(nominalWithGap(2_000_000))
      expect(screen.getByText(/^\d+ months? ahead$/)).toBeInTheDocument()
    })

    it('says on track within a month of the line, ahead or behind', () => {
      badge(nominalWithGap(1_000))
      expect(screen.getByText('On track')).toBeInTheDocument()
    })

    it('says on track for a little behind too, instead of how far behind in money', () => {
      badge(nominalWithGap(-1_000))
      expect(screen.getByText('On track')).toBeInTheDocument()
      expect(screen.queryByText(/behind/)).not.toBeInTheDocument()
    })

    it('counts months once the balance is more than a month from the line', () => {
      badge(nominalWithGap(-1_500_000))
      expect(screen.getByText(/^\d+ months? behind$/)).toBeInTheDocument()
    })

    it('gives the gap in money when the plan never has the balance', () => {
      badge(100_000_000_00)
      expect(screen.getByText(/€ ahead$/)).toBeInTheDocument()
    })
  })

  it('nudges for a check-in once the last one is a month old', () => {
    const onLogCheckin = vi.fn()
    const dataset = makeDataset({
      goalScenarios: [makeScenario({ id: 1, isActive: true })],
      wealthAccounts: [makeWealthAccount({ id: 1 })],
      wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: daysAgoIso(45) })],
    })
    render(<GoalsCard dataset={dataset} onLogCheckin={onLogCheckin} />)

    expect(screen.getByText('Last check-in 45 days ago.')).toBeInTheDocument()
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
    const dataset = makeDataset({
      goalScenarios: [makeScenario({ id: 1, isActive: true })],
      wealthAccounts: [makeWealthAccount({ id: 1 })],
      wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: daysAgoIso(3) })],
    })
    const { rerender } = render(<GoalsCard dataset={dataset} onLogCheckin={vi.fn()} />)
    expect(screen.queryByText(/Last check-in/)).not.toBeInTheDocument()

    rerender(
      <GoalsCard
        dataset={{ ...dataset, wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: daysAgoIso(90) })] }}
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

describe('the track badge around a house purchase', () => {
  // The sample plan buys a house in year 8, on 1 January 2034. A week before, the line is still
  // climbing; it drops by the payment on the day.
  const account = makeWealthAccount({ id: 1, kind: 'investment' })
  const scenario = samplePlan({ id: 1, isActive: true })
  const date = '2033-12-25'
  const inflation = 0.02
  const real = planValueAtDate(scenario, date, inflation)!
  const badge = (gapCents: number) => {
    const nominal = realToNominal(real + gapCents, '2026-01-01', date, inflation)
    render(
      <GoalsCard
        dataset={makeDataset({
          goalScenarios: [scenario],
          wealthAccounts: [account],
          wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: date, entries: [{ accountId: 1, valueCents: nominal }] })],
        })}
      />,
    )
  }

  it('says on track for someone exactly on plan the week before the payment', () => {
    // Before the line followed the engine through the year, this read about 62.000 euros ahead.
    badge(0)
    expect(screen.getByText('On track')).toBeInTheDocument()
  })

  it('gives the gap in money, not months, for a lead the plan only has after the payment', () => {
    badge(500_000)
    expect(screen.getByText(/€ ahead$/)).toBeInTheDocument()
    expect(screen.queryByText(/(months?|years?) ahead$/)).not.toBeInTheDocument()
  })
})
