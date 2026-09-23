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
  it('asks for a check-in when there is an account to log against', () => {
    render(<WealthSummaryCard checkins={[]} accounts={[makeAccount(1, 'investment')]} plan={null} />)
    expect(screen.getByText(/log your first wealth check-in/i)).toBeInTheDocument()
  })

  it('points to Setup when there is no account yet', () => {
    render(<WealthSummaryCard checkins={[]} accounts={[]} plan={null} />)
    expect(screen.getByText(/under Setup/)).toBeInTheDocument()
    expect(screen.queryByText(/log your first wealth check-in/i)).not.toBeInTheDocument()
  })

  it('shows net worth from latest check-in', () => {
    const accounts = [makeAccount(1, 'investment'), makeAccount(2, 'cash')]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 100_000_00 }])]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} />)
    expect(screen.getByText(/progress snapshot/i)).toBeInTheDocument()
    expect(screen.getByText(/no plan chosen yet/i)).toBeInTheDocument()
  })

  it('says the plan has no start date, rather than that none is chosen', () => {
    const plan = makeScenario({ name: 'Path A', planStartDate: null, isActive: true })
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 100_000_00 }])]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
    expect(screen.getByText(/Path A has no start date yet/)).toBeInTheDocument()
    expect(screen.queryByText(/no plan chosen/i)).not.toBeInTheDocument()
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
      <WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />,
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
      <WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />,
    )
    // A hundred million against a 1,000 a month plan is decades, not a month count.
    expect(screen.getByText(/more than \d+ years ahead/)).toBeInTheDocument()
  })

  it('reads the return "so far" under a year of check-ins', () => {
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2026-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: 105_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} />)
    expect(screen.getByText(/returned/)).toHaveTextContent(/5,0\s?% so far since/)
    expect(screen.queryByText(/a year/)).not.toBeInTheDocument()
  })

  it('compounds a year or more to a yearly rate and sets it against the plan', () => {
    const scenario = makeScenario({ name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-01-01', [{ accountId: 1, valueCents: 104_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
    const line = screen.getByText(/Your portfolio returned/)
    expect(line).toHaveTextContent(/4,0\s?% a year/)
    expect(line).toHaveTextContent(/7,0\s?% a year, after inflation, that Path A assumes/)
  })
})
