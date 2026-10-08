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

  it('points to Assumptions when there is no account yet', () => {
    render(<WealthSummaryCard checkins={[]} accounts={[]} plan={null} />)
    expect(screen.getByText(/Set up accounts in Assumptions/)).toBeInTheDocument()
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

  describe('how far along the plan a balance is', () => {
    const scenario = makeScenario({
      planStartDate: '2020-01-01',
      startInvestedCents: 0,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.07,
      horizonYears: 30,
    })
    const accounts = [makeAccount(1, 'investment')]
    const date = '2025-06-01'
    const withGap = (gapCents: number) => {
      const projected = planValueAtDate(scenario, date, DEFAULT_INFLATION_RATE)!
      const nominal = realToNominal(projected + gapCents, scenario.planStartDate!, date, DEFAULT_INFLATION_RATE)
      return [makeCheckin(1, date, [{ accountId: 1, valueCents: nominal }])]
    }

    it('says how many months ahead of the plan a balance is, and the day the plan reaches it', () => {
      render(<WealthSummaryCard checkins={withGap(2_000_000)} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/which only reaches this balance on/)).toHaveTextContent(
        /^\d+ months? ahead of the plan, which only reaches this balance on .*20\d\d\.$/,
      )
    })

    it('says how many months behind, and the day the plan had the balance', () => {
      render(<WealthSummaryCard checkins={withGap(-2_000_000)} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/which already had this balance on/)).toHaveTextContent(
        /^\d+ months? behind the plan, which already had this balance on .*20\d\d\.$/,
      )
    })

    it('leaves the months out when the plan never has the balance, and still gives the gap in money', () => {
      // A hundred million against a plan that ends far below it: the plan has no point to read it at.
      const checkins = [makeCheckin(1, date, [{ accountId: 1, valueCents: 100_000_000_00 }])]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/ahead of plan/i)).toBeInTheDocument()
      expect(screen.queryByText(/of the plan, which only reaches/)).not.toBeInTheDocument()
    })
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

  it('sets the pace against what the plan averages over those months when it changes its monthly amount', () => {
    // 1,000 a month from the start, 2,000 from April: five months of 1,000, 1,000, 1,000, 2,000, 2,000 average 1,400.
    const scenario = makeScenario({
      name: 'Path A',
      planStartDate: '2025-01-01',
      monthlyContributionCents: 100_000,
      contributionSchedule: [{ from: '2025-04', monthlyCents: 200_000 }],
    })
    const accounts = [makeAccount(1)]
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 10_000_000 }])]
    const invest = (id: number, month: string, amountCents: number) =>
      makeTransaction({ id, type: 'investment', budgetMonth: month, date: `${month}-10`, amountCents })
    const kept = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'].map((m, i) => invest(i + 1, m, 140_000))
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} transactions={kept} />)

    const pace = screen.getByText(/a month on average it assumes/)
    expect(pace).toHaveTextContent(/against the 1\.400,00 € a month on average it assumes \(1\.000,00 € at first, 2\.000,00 € now\)\./)
    // 1,400 a month kept against an average of 1,400 planned is on pace; against the 1,000 it started
    // with it would have read ahead, and against the 2,000 it ends on, behind.
    expect(screen.getByText(/1\.400,00 € a month$/)).toHaveStyle({ color: 'var(--exp-success)' })
  })

  it('says nothing about pace for a plan that pauses over every month it is compared on', () => {
    const scenario = makeScenario({
      planStartDate: '2025-01-01',
      monthlyContributionCents: 100_000,
      contributionSchedule: [{ from: '2025-01', monthlyCents: 0 }],
    })
    render(
      <WealthSummaryCard
        checkins={[makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 10_000_000 }])]}
        accounts={[makeAccount(1)]}
        plan={scenario}
        transactions={[makeTransaction({ id: 1, type: 'investment', budgetMonth: '2025-02', date: '2025-02-10', amountCents: 50_000 })]}
      />,
    )
    expect(screen.queryByText(/a month it assumes/)).not.toBeInTheDocument()
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

  it('sets a return under a year against what the plan expects over the same days, not its yearly rate', () => {
    const plan = makeScenario({ name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2026-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: 105_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
    // 181 days at 7% after inflation and 2% inflation is (1.07 x 1.02) ^ (181 / 365.25) - 1, about 4.4%.
    expect(screen.getByText(/returned/)).toHaveTextContent(
      /returned 5,0\s?% so far since .*, where Path A assumes about 4,4\s?% over the same days \(7,0\s?% a year after inflation, with 2,0\s?% inflation\)\./,
    )
  })

  it('reads a return over a year as a yearly rate, after inflation, against the plan', () => {
    const plan = makeScenario({ name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: 125_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
    const hint = screen.getByText(/returned/)
    expect(hint).toHaveTextContent(/returned 16,\d\s?% a year since .*, about 13,\d\s?% once 2,0\s?% inflation is taken off against the 7,0\s?% a year, after inflation, that Path A assumes\./)
    expect(screen.getByText(/a year$/)).toHaveStyle({ color: 'var(--exp-success)' })
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
