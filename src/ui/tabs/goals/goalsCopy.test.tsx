import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssumptionsView } from './AssumptionsView'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsTab } from './GoalsTab'
import { buildExpenseModel } from '../../buildExpenseModel'
import { defaultExpenseSettings, fireNumber, replayRetirement, resolveMoneyFormat } from '../../../engine'
import { MoneyFormatContext } from '../../hooks/moneyFormatContext'
import { SPREAD_RUNS } from './charts/spreadModel'
import { ODDS_RUNS, runsOfHundred } from './charts/retirementOddsLine'
import { makeDataset } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

// "Assumptions" is the name of a tab, holding what Progress is measured with. The Scenarios
// controls are not assumptions, or someone looking for the return rate opens the wrong tab.
describe('Goals copy that names the Assumptions tab', () => {
  it('introduces Plan without calling its controls assumptions', () => {
    render(<GoalsTab model={buildExpenseModel(makeDataset())} />)

    expect(screen.getByText(/when you can reach financial independence/)).toBeInTheDocument()
    expect(screen.queryByText(/different assumptions/)).not.toBeInTheDocument()
  })

  it('keeps the word for the tab, and the inflation set there, in the glossary', () => {
    const { container } = render(<GoalsExplainer />)

    const text = container.textContent ?? ''
    expect(text).toContain('the assumed inflation set in Assumptions')
    expect(text.replace('the assumed inflation set in Assumptions', '').replace('the Market bounce card in Assumptions', '')).not.toMatch(/assumptions/i)
  })

  it('says where the market bounce is set, since the spread card uses it before anything says what it is', () => {
    const { container } = render(<GoalsExplainer />)

    expect(container.textContent).toContain('You set it in the Market bounce card in Assumptions.')
  })

  it('writes every number of the glossary in the owner\'s number style, the guide and the count of runs as much as the worked example', () => {
    const usd = render(<MoneyFormatContext.Provider value={resolveMoneyFormat('USD', 'en-US')}><GoalsExplainer /></MoneyFormatContext.Provider>).container.textContent ?? ''
    expect(usd).toContain('4% up to 35 years, 3.5% up to 49 and 3.25% from 50')
    expect(usd).toContain('replays the plan in 10,000 different markets')
    expect(usd).toContain('default $500 in demo')
    expect(usd).not.toContain('3,5%')
    expect(usd).not.toContain('10.000')
    const euro = render(<GoalsExplainer />).container.textContent ?? ''
    expect(euro).toContain('4% up to 35 years, 3,5% up to 49 and 3,25% from 50')
    expect(euro).toContain('replays the plan in 10.000 different markets')
  })

  it('says how many runs the glossary says, as many as the card runs', () => {
    expect(SPREAD_RUNS).toBe(10_000)
  })

  it('says that a mixed portfolio bounces less but also grows less, so the return comes down with the bounce', () => {
    const { container } = render(<GoalsExplainer />)

    expect(container.textContent).toContain('A mixed portfolio bounces less but also grows less: choose a lower bounce here and a lower return on the plan.')
  })

  it('gives the chance of the money lasting for the return and bounce it is true for, and the figure is what the engine says', () => {
    const { container } = render(<GoalsExplainer />)
    const spend = 3_000_000
    const lasts = replayRetirement({
      startCents: fireNumber(spend, 0.04),
      annualWithdrawalCents: spend,
      realReturn: 0.05,
      volatility: 0.15,
      years: 30,
      runs: ODDS_RUNS,
    }).lasts

    expect(runsOfHundred(lasts)).toBe(86)
    expect(container.textContent).toContain(
      'With a typical return of 5% and a bounce of 15%, 4% over 30 years lasts in about 86 of 100: the other 14 are the runs with bad early years. A lower rate or a higher return lasts more often, a smaller bounce does too at a return like this, and a longer retirement lasts less often.',
    )
  })

  it('says in the glossary that the drawdown card still gives the odds when FI is not reached', () => {
    const { container } = render(<GoalsExplainer />)

    expect(container.textContent).toContain('the drawdown chart shows the target only, and the chance the money lasts is still said under its title, since it starts at the target.')
  })

  it('introduces the Assumptions view in plain sentences', () => {
    render(
      <AssumptionsView
        accounts={[]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={makeActions()}
        onSettingsChange={vi.fn()}
      />,
    )

    const intro = screen.getByText(/Progress is measured with your milestones/)
    expect(intro.textContent).not.toContain(';')
    expect(intro.textContent).toContain('assumed inflation rate')
    // A pointer to where other inputs are, not part of what the intro defines.
    const pointer = screen.getByText('The return, the house and life after FI are set per scenario, in Scenarios.')
    expect(pointer).not.toBe(intro)
  })
})
