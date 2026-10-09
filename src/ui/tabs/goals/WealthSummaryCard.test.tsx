import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WealthSummaryCard } from './WealthSummaryCard'
import { planValueAtDate, realToNominal, trackStatus, DEFAULT_INFLATION_RATE } from '../../../engine'
import { EU_MONEY_FORMAT } from '../../../engine/money'
import { formatMoneyShort } from './chartTheme'
import { makeScenario, makeTransaction } from '../../../testing/factories'
import { samplePlan } from '../../../testing/samplePlan'
import { planLineOf, planValueAt, planValueBefore, projectNetWorth, scenarioToParams } from '../../../engine'
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

  describe('the tiles', () => {
    // Started 1 January 2020, checked in 9 October 2026 with 180.000 on the account: at 2% that is about 158.000 in the
    // euros of 2020, which is the money the plan and its gap are in.
    const plan = makeScenario({ planStartDate: '2020-01-01', startInvestedCents: 5_000_000, monthlyContributionCents: 100_000, expectedRealReturn: 0.05, horizonYears: 30 })
    const accounts = [makeAccount(1, 'investment'), makeAccount(2, 'cash')]
    const checkins = [makeCheckin(1, '2026-10-09', [{ accountId: 1, valueCents: 18_000_000 }, { accountId: 2, valueCents: 2_200_000 }])]
    const short = (cents: number) => formatMoneyShort(cents, EU_MONEY_FORMAT)

    it('puts the investments and the plan projection in the same money, the plan\'s, and names it', () => {
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
      const status = trackStatus(checkins[0]!, plan, accounts, DEFAULT_INFLATION_RATE)!
      const tile = (label: string) => screen.getByText(label).nextElementSibling!.textContent
      expect(tile('Investments, in 2020 euros')).toBe(short(status.actualRealInvestedCents))
      expect(tile('Plan projection, in 2020 euros')).toBe(short(status.projectedInvestedCents))
      // So that the two tiles can be taken from each other to give the gap above them.
      expect(status.actualRealInvestedCents - status.projectedInvestedCents).toBe(status.deltaCents)
    })

    it('says the net worth is every account on the account\'s euros, and keeps the balance as logged in the hover text', () => {
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
      expect(screen.getByText('Net worth, all accounts').nextElementSibling).toHaveTextContent(short(20_200_000))
      expect(screen.getByText('Investments, in 2020 euros').nextElementSibling).toHaveAttribute('title', `As logged on your account: ${short(18_000_000)}`)
    })

    it('shows the balance as logged, unnamed, when there is no plan to compare it with', () => {
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={null} />)
      expect(screen.getByText('Investments').nextElementSibling).toHaveTextContent(short(18_000_000))
      expect(screen.queryByText(/Plan projection/)).not.toBeInTheDocument()
    })
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
      expect(screen.getByText(/which only reaches this balance around/)).toHaveTextContent(
        /^\d+ months? ahead of the plan, which only reaches this balance around [A-Z][a-z]{2} 20\d\d\.$/,
      )
    })

    it('says how many months behind, and the day the plan had the balance', () => {
      render(<WealthSummaryCard checkins={withGap(-2_000_000)} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/which already had this balance around/)).toHaveTextContent(
        /^\d+ months? behind the plan, which already had this balance around [A-Z][a-z]{2} 20\d\d\.$/,
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

  describe('the pace is read on whole months', () => {
    const scenario = makeScenario({ name: 'Path A', planStartDate: '2025-02-01', monthlyContributionCents: 100_000 })
    const checkins = [makeCheckin(1, '2025-06-01', [{ accountId: 1, valueCents: 10_000_000 }])]
    const invest = (id: number, month: string, amountCents: number) =>
      makeTransaction({ id, type: 'investment', budgetMonth: month, date: `${month}-10`, amountCents })
    const renderPace = (transactions: ReturnType<typeof invest>[], openBudgetMonth?: string) =>
      render(
        <WealthSummaryCard
          checkins={checkins}
          accounts={[makeAccount(1)]}
          plan={scenario}
          transactions={transactions}
          openBudgetMonth={openBudgetMonth}
        />,
      )

    it('leaves the month under way out, and says the months are full ones', () => {
      renderPace([invest(1, '2025-02', 100_000), invest(2, '2025-03', 100_000), invest(3, '2025-04', 83_300)], '2025-04')
      expect(screen.getByText(/a month it assumes/)).toHaveTextContent(
        /Investing 1\.000,00 € a month on average over the 2 full months since the plan started, against the 1\.000,00 € a month it assumes/,
      )
    })

    it('counts a month with nothing recorded as a month of nothing invested', () => {
      renderPace([invest(1, '2025-02', 100_000), invest(2, '2025-04', 100_000)])
      expect(screen.getByText(/a month it assumes/)).toHaveTextContent(
        /Investing 666,67 € a month on average over the 3 months since the plan started/,
      )
    })

    it('does not call a pace a few euros short behind', () => {
      renderPace([invest(1, '2025-02', 99_000), invest(2, '2025-03', 99_000)])
      expect(screen.getByText(/990,00 € a month$/)).toHaveStyle({ color: 'var(--exp-success)' })
    })

    it('is behind once the shortfall is more than that', () => {
      renderPace([invest(1, '2025-02', 97_000), invest(2, '2025-03', 97_000)])
      expect(screen.getByText(/970,00 € a month$/)).toHaveStyle({ color: 'var(--exp-danger)' })
    })

    it('says the months are the ones recorded when they do not start at the plan', () => {
      // The record starts in March, a month after the plan did.
      renderPace([invest(1, '2025-03', 100_000), invest(2, '2025-04', 100_000)])
      expect(screen.getByText(/a month it assumes/)).toHaveTextContent(/over the 2 months recorded, against/)
      expect(screen.queryByText(/since the plan started/)).not.toBeInTheDocument()
    })

    it('says nothing when the only month on record is the one under way', () => {
      renderPace([invest(1, '2025-04', 83_300)], '2025-04')
      expect(screen.queryByText(/a month it assumes/)).not.toBeInTheDocument()
    })
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
    const plan = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
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
    const plan = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: 125_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />)
    const hint = screen.getByText(/returned/)
    expect(hint).toHaveTextContent(/returned 16,\d\s?% a year since .*, about 13,\d\s?% once 2,0\s?% inflation is taken off against the 7,0\s?% a year, after inflation, that Path A assumes\./)
  })

  it('does not colour a yearly return from under ten years, and says why', () => {
    const plan = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: 125_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={[makeAccount(1, 'investment')]} plan={plan} />)
    expect(screen.getByText(/a year$/).style.color).toBe('')
    expect(screen.getByText(/returned/)).toHaveTextContent('A few years of returns say little about a long-run 7,0% a year.')
  })

  it('colours a yearly return against the plan from ten years of history, with nothing to excuse it', () => {
    const plan = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2015-01-01' })
    const checkins = (end: number) => [
      makeCheckin(1, '2015-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-07-01', [{ accountId: 1, valueCents: end }]),
    ]
    const { rerender } = render(
      <WealthSummaryCard checkins={checkins(400_000_00)} accounts={[makeAccount(1, 'investment')]} plan={plan} />,
    )
    expect(screen.getByText(/a year$/)).toHaveStyle({ color: 'var(--exp-success)' })
    expect(screen.getByText(/returned/)).not.toHaveTextContent('say little')

    rerender(<WealthSummaryCard checkins={checkins(120_000_00)} accounts={[makeAccount(1, 'investment')]} plan={plan} />)
    expect(screen.getByText(/a year$/)).toHaveStyle({ color: 'var(--exp-danger)' })
  })

  describe('where the gap comes from', () => {
    const scenario = makeScenario({ id: 1, name: 'Path A', planStartDate: '2025-01-01', monthlyContributionCents: 100_000, contributionSchedule: [], housePurchaseYear: null, lifeEvents: [] })
    const accounts = [makeAccount(1, 'investment')]
    const at = (id: number, date: string, gap: number) =>
      makeCheckin(id, date, [
        { accountId: 1, valueCents: realToNominal(planValueAtDate(scenario, date, DEFAULT_INFLATION_RATE)! + gap, '2025-01-01', date, DEFAULT_INFLATION_RATE) },
      ])

    it('names the rows that add up to the gap, in the plan’s euros, and leaves the empty ones out', () => {
      const checkins = [at(1, '2025-01-10', -50_000_00), at(2, '2026-07-15', -50_000_00)]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
      const block = screen.getByText(/the plan by/).closest('div')!
      expect(within(block).getByText(/Behind the plan by .*€/)).toBeInTheDocument()
      expect(within(block).getByText(/\(in 2025 euros\)/)).toBeInTheDocument()
      expect(within(block).getByText('You started behind the plan')).toBeInTheDocument()
      expect(within(block).queryByText(/Investing more than planned/)).not.toBeInTheDocument()
    })

    it('suggests a re-baseline when where the plan started is what explains the gap', () => {
      const checkins = [at(1, '2025-01-10', -50_000_00), at(2, '2026-07-15', -50_000_00)]
      const onRebaseline = vi.fn()
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} onRebaseline={onRebaseline} />)

      expect(screen.getByText(/At least half of this gap comes from where the plan started/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Re-baseline from latest check-in' }))
      expect(onRebaseline).toHaveBeenCalled()
    })

    it('says nothing about re-baselining when saving has closed the gap that the start opened', () => {
      const checkins = [at(1, '2025-01-10', -90_000_00), at(2, '2026-07-15', -5_000_00)]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} onRebaseline={vi.fn()} />)

      expect(screen.queryByText(/At least half of this gap comes from where the plan started/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Re-baseline from latest check-in' })).not.toBeInTheDocument()
    })

    it('does not offer the button in a read-only session', () => {
      const checkins = [at(1, '2025-01-10', -50_000_00), at(2, '2026-07-15', -50_000_00)]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/At least half of this gap comes from where the plan started/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Re-baseline from latest check-in' })).not.toBeInTheDocument()
    })

    it('says investing and the market are together when nothing is recorded though the plan invests', () => {
      const checkins = [at(1, '2025-01-10', 0), at(2, '2026-02-01', 0)]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
      expect(screen.getByText('Your investing and the market together')).toBeInTheDocument()
      expect(screen.getByText(/Shown together because nothing is recorded as an investment since/)).toBeInTheDocument()
      expect(screen.queryByText('The market doing better than the plan assumes')).not.toBeInTheDocument()
    })

    it('calls the first row what happened before the first check-in when it came more than a month after the start', () => {
      const checkins = [at(1, '2025-04-01', -50_000_00), at(2, '2026-07-15', -50_000_00)]
      render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
      expect(screen.getByText('Behind before your first check-in')).toBeInTheDocument()
    })

    it('asks for a second check-in a month or more after the first when there is only one', () => {
      render(<WealthSummaryCard checkins={[at(1, '2026-01-01', -1_000_00)]} accounts={accounts} plan={scenario} />)
      expect(screen.getByText(/Two check-ins a month or more apart/)).toBeInTheDocument()
    })
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
    const scenario = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2025-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    const checkins = [
      makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2026-01-01', [{ accountId: 1, valueCents: 104_000_00 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
    const line = screen.getByText(/Your portfolio returned/)
    expect(line).toHaveTextContent(/4,0\s?% a year since Jan 1, 2025, about 2,0\s?% once 2,0\s?% inflation is taken off/)
    expect(line).toHaveTextContent(/against the 7,0\s?% a year, after inflation, that Path A assumes/)
  })

  it('colours the return by its real rate, so a nominal match with the plan is still short', () => {
    const scenario = makeScenario({ monthlyContributionCents: 0, name: 'Path A', expectedRealReturn: 0.07, planStartDate: '2015-01-01' })
    const accounts = [makeAccount(1, 'investment')]
    // Ten years at 7% a year in the money of the day, which is 4,9% once 2% inflation is taken off.
    const checkins = [
      makeCheckin(1, '2015-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
      makeCheckin(2, '2025-01-01', [{ accountId: 1, valueCents: 196_715_14 }]),
    ]
    render(<WealthSummaryCard checkins={checkins} accounts={accounts} plan={scenario} />)
    const rate = screen.getByText(/7,0\s?% a year$/)
    expect(rate).toHaveStyle({ color: 'var(--exp-danger)' })
  })
})

describe('the status around a house purchase and at the edges of the plan', () => {
  const accounts = [makeAccount(1, 'investment')]
  const plan = samplePlan({ name: 'Sample', id: 1, isActive: true })
  const inflation = 0.02
  const checkinFor = (date: string, gapCents = 0) => {
    const real = planValueAtDate(plan, date, inflation) ?? 0
    return [makeCheckin(1, date, [{ accountId: 1, valueCents: realToNominal(real + gapCents, '2026-01-01', date, inflation) }])]
  }

  it('says on track, with the gap in money, for someone exactly on plan a week before the payment', () => {
    render(<WealthSummaryCard checkins={checkinFor('2033-12-25')} accounts={accounts} plan={plan} />)
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.queryByText(/ahead of plan|behind plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/of the plan, which/)).not.toBeInTheDocument()
  })

  it('says why there are no months for a lead only the far side of the payment has', () => {
    render(<WealthSummaryCard checkins={checkinFor('2033-12-25', 500_000)} accounts={accounts} plan={plan} />)
    expect(screen.getByText(/ahead of plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Months are not counted across a house purchase or a one-off event/)).toBeInTheDocument()
    expect(screen.queryByText(/of the plan, which only reaches/)).not.toBeInTheDocument()
  })

  it('says a payment made a fortnight early is read against the plan with it made', () => {
    // The line holds the portfolio before the 70.871 payment on 18 December; this one has paid it already.
    const line = planLineOf(projectNetWorth(scenarioToParams(plan, inflation)))
    const payment = planValueBefore(line, 8)! - planValueAt(line, 8)!
    render(<WealthSummaryCard checkins={checkinFor('2033-12-18', -payment)} accounts={accounts} plan={plan} />)
    expect(screen.getByText('On track')).toBeInTheDocument()
    expect(screen.getByText(/within a month of this check-in/)).toHaveTextContent(
      /falls on .*2034, within a month of this check-in, so your balance is read against the plan with it already made\./,
    )
  })

  it('says the plan starts after the latest check-in, rather than that it has no start date', () => {
    const later = samplePlan({ name: 'Sample', planStartDate: '2027-01-01' })
    render(<WealthSummaryCard checkins={[makeCheckin(1, '2026-06-01', [{ accountId: 1, valueCents: 5_000_000 }])]} accounts={accounts} plan={later} />)
    expect(screen.getByText(/Sample starts on .*2027, after your latest check-in/)).toBeInTheDocument()
    expect(screen.queryByText(/no start date/)).not.toBeInTheDocument()
  })

  it('says the plan has ended when the latest check-in is past its last year', () => {
    const short = samplePlan({ name: 'Sample', horizonYears: 5 })
    render(<WealthSummaryCard checkins={[makeCheckin(1, '2033-06-01', [{ accountId: 1, valueCents: 5_000_000 }])]} accounts={accounts} plan={short} />)
    expect(screen.getByText(/Sample ends on .*2031, before your latest check-in/)).toBeInTheDocument()
  })
})

describe('the return when money may have moved in without being recorded', () => {
  const accounts = [makeAccount(1, 'investment')]
  const plan = makeScenario({ name: 'Path A', planStartDate: '2024-01-01', monthlyContributionCents: 100_000 })
  const year = (end: number) => [
    makeCheckin(1, '2025-01-01', [{ accountId: 1, valueCents: 100_000_00 }]),
    makeCheckin(2, '2026-01-01', [{ accountId: 1, valueCents: end }]),
  ]

  it('says no investments are recorded, and hides the percentage, when the plan expects some', () => {
    // 18% a year with nothing recorded is 18.000 euros moved in, not 18.000 euros earned.
    render(<WealthSummaryCard checkins={year(118_000_00)} accounts={accounts} plan={plan} transactions={[]} />)
    const hint = screen.getByText(/no investments are recorded/i)
    expect(hint).toHaveTextContent(/Path A expects 1\.000,00 € a month, but no investments are recorded since Jan 1, 2025/)
    expect(hint).toHaveTextContent(/Add what you moved in as Investment transactions to see the return/)
    expect(screen.queryByText(/% a year/)).not.toBeInTheDocument()
  })

  it('says the balance grew too fast to be a market return, when it did, and hides it', () => {
    const idle = makeScenario({ name: 'Path A', planStartDate: '2024-01-01', monthlyContributionCents: 0, contributionSchedule: [] })
    render(<WealthSummaryCard checkins={year(150_000_00)} accounts={accounts} plan={idle} transactions={[]} />)
    const hint = screen.getByText(/more than 30% a year/)
    expect(hint).toHaveTextContent(/usually money you moved in that is not recorded/)
    expect(screen.queryByText(/returned/)).not.toBeInTheDocument()
  })

  it('still gives the return when the investments are recorded and it is believable', () => {
    const deposit = makeTransaction({ date: '2025-06-01', budgetMonth: '2025-06', type: 'investment', amountCents: 1_000_00 })
    render(<WealthSummaryCard checkins={year(108_000_00)} accounts={accounts} plan={plan} transactions={[deposit]} />)
    expect(screen.getByText(/Your portfolio returned/)).toHaveTextContent(/returned 7,\d\s?% a year since/)
    expect(screen.queryByText(/no investments are recorded|more than 30%/)).not.toBeInTheDocument()
  })
})
