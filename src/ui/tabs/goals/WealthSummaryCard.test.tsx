import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WealthSummaryCard } from './WealthSummaryCard'
import { planValueAtDate, realToNominal, DEFAULT_INFLATION_RATE } from '../../../engine'
import { makeScenario, makeTransaction } from '../../../testing/factories'
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

  it('reads the pace kept against the plan, naming a typical month when a lump sum skews the mean', () => {
    const scenario = makeScenario({ name: 'Path A', planStartDate: '2025-01-01', monthlyContributionCents: 150_000 })
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 10_000_000 }])]
    const invest = (id: number, month: string, amountCents: number) =>
      makeTransaction({ id, type: 'investment', budgetMonth: month, date: `${month}-10`, amountCents })
    // Five months of 1,000 and one 50,000 sale of a flat: the mean says 9,166, a typical month 1,000.
    const steady = [
      invest(1, '2025-01', 100_000),
      invest(2, '2025-02', 100_000),
      invest(3, '2025-03', 100_000),
      invest(4, '2025-04', 100_000),
      invest(5, '2025-05', 100_000),
    ]
    const { rerender } = render(
      <WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} transactions={steady} />,
    )
    const pace = () => screen.getByText(/a month it assumes/)
    expect(pace()).toHaveTextContent(/Investing 1\.000,00 € a month on average over the 5 months since the plan started, against the 1\.500,00 € a month it assumes/)
    expect(screen.queryByText(/typical month/)).not.toBeInTheDocument()
    expect(screen.getByText(/1\.000,00 € a month$/)).toHaveStyle({ color: 'var(--exp-danger)' })

    rerender(
      <WealthSummaryCard
        checkins={checkins}
        accounts={accounts}
        plan={scenario}
        transactions={[...steady, invest(6, '2025-06', 5_000_000)]}
      />,
    )
    expect(pace()).toHaveTextContent(/9\.166,67 € a month on average over the 6 months since the plan started, 1\.000,00 € in a typical month/)
    expect(screen.getByText(/9\.166,67 € a month$/)).toHaveStyle({ color: 'var(--exp-success)' })
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

  it('suggests a re-baseline when the gap has held still for half a year', () => {
    const scenario = makeScenario({ id: 1, name: 'Path A', planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const behind = (id: number, date: string) =>
      makeCheckin(id, date, [
        { accountId: 1, valueCents: realToNominal(planValueAtDate(scenario, date, DEFAULT_INFLATION_RATE)! - 50_000_00, '2025-01-01', date, DEFAULT_INFLATION_RATE) },
      ])
    const checkins = [behind(1, '2026-01-01'), behind(2, '2026-04-01'), behind(3, '2026-07-15')]
    const onRebaseline = vi.fn()
    render(
      <WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} onRebaseline={onRebaseline} />,
    )

    expect(screen.getByText(/Every check-in since .*2026 has sat about 50k € behind/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
    expect(onRebaseline).toHaveBeenCalled()
  })

  it('says nothing about re-baselining while the gap is still moving', () => {
    const scenario = makeScenario({ id: 1, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const at = (id: number, date: string, gap: number) =>
      makeCheckin(id, date, [{ accountId: 1, valueCents: planValueAtDate(scenario, date, DEFAULT_INFLATION_RATE)! + gap }])
    const checkins = [at(1, '2026-01-01', -90_000_00), at(2, '2026-04-01', -40_000_00), at(3, '2026-07-15', -5_000_00)]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} onRebaseline={vi.fn()} />)

    expect(screen.queryByText(/Every check-in since/)).not.toBeInTheDocument()
  })

  it('reads the cash reserve as months of spending, against the target when set', () => {
    const accounts = [makeAccount(1, 'investment'), makeAccount(2, 'cash')]
    const checkins = [
      makeCheckin(1, '2026-07-01', [
        { accountId: 1, valueCents: 100_000_00 },
        { accountId: 2, valueCents: 9_000_00 },
      ]),
    ]
    const spend = [
      makeTransaction({ budgetMonth: '2026-06', date: '2026-06-10', type: 'expense', amountCents: 3_000_00 }),
      makeTransaction({ budgetMonth: '2026-07', date: '2026-07-10', type: 'expense', amountCents: 3_000_00 }),
    ]
    const { rerender } = render(
      <WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} transactions={spend} cashReserveMonths={6} />,
    )
    expect(screen.getByText(/Cash reserve:/)).toHaveTextContent(/covers 3\.0 months of spending, against a target of 6/)

    rerender(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} transactions={spend} />)
    expect(screen.getByText(/Cash reserve:/)).toHaveTextContent(/about 3\.0 months of spending/)

    rerender(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} />)
    expect(screen.getByText(/Cash reserve:/)).toHaveTextContent(/^Cash reserve: 9k €\.$/)
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
    expect(line).toHaveTextContent(/4,0\s?% a year since Jan 1, 2025, about 2,0\s?% once 2,0\s?% inflation is taken off/)
    expect(line).toHaveTextContent(/against the 7,0\s?% a year, after inflation, that Path A assumes/)
    expect(screen.getByText(/4,0\s?% a year$/)).toHaveStyle({ color: 'var(--exp-danger)' })
  })

  it('colours the return by its real rate, so a nominal match with the plan is still short', () => {
    const scenario = makeScenario({ name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-01-01', [{ accountId: 1, valueCents: 107_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
    const rate = screen.getByText(/7,0\s?% a year$/)
    expect(rate).toHaveStyle({ color: 'var(--exp-danger)' })
  })
})
