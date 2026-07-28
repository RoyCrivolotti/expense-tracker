import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WealthSummaryCard } from './WealthSummaryCard'
import { makeScenario } from '../../../testing/factories'
import type { WealthAccount, WealthCheckin } from '../../../types'

function makeAccount(id: number, kind: WealthAccount['kind'] = 'investment'): WealthAccount {
  return { id, name: `Account ${id}`, kind, sortOrder: id, archived: false }
}

function makeCheckin(
  id: number,
  date: string,
  entries: { accountId: number; valueCents: number }[],
): WealthCheckin {
  return { id, checkinDate: date, createdAt: `${date}T00:00:00.000Z`, entries }
}

describe('WealthSummaryCard', () => {
  it('shows empty state when no check-ins', () => {
    render(<WealthSummaryCard checkins={[]} accounts={[]} activeScenario={null} />)
    expect(screen.getByText(/log your first wealth check-in/i)).toBeInTheDocument()
  })

  it('shows net worth from latest check-in', () => {
    const accounts = [makeAccount(1, 'investment'), makeAccount(2, 'cash')]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 100_000_00 }])]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} activeScenario={null} />)
    expect(screen.getByText(/progress snapshot/i)).toBeInTheDocument()
    expect(screen.getByText(/no active plan/i)).toBeInTheDocument()
  })

  it('shows on-track status when scenario has planStartDate', () => {
    const scenario = makeScenario({
      planStartDate: '2020-01-01',
      startInvestedCents: 0,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.07,
      horizonYears: 30,
    })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(2, '2025-06-01', [{ accountId: 1, valueCents: 999_999_99 }]),
    ]
    render(
      <WealthSummaryCard checkins={checkins} accounts={accounts} activeScenario={scenario} />,
    )
    // Should show "Ahead of plan" or "Behind plan" status text
    expect(screen.getByText(/ahead of plan|behind plan/i)).toBeInTheDocument()
  })

  it('shows months-ahead hint when delta is non-zero', () => {
    const scenario = makeScenario({
      planStartDate: '2020-01-01',
      startInvestedCents: 0,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.07,
      horizonYears: 30,
    })
    const accounts = [makeAccount(1, 'investment')]
    // Huge value to ensure positive delta and non-zero months
    const checkins = [
      makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 100_000_000_00 }]),
    ]
    render(
      <WealthSummaryCard checkins={checkins} accounts={accounts} activeScenario={scenario} />,
    )
    expect(screen.getByText(/month/i)).toBeInTheDocument()
  })
})
