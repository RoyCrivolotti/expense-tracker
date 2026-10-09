import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { currencyWord, resolveMoneyFormat } from '../../../engine/money'
import { defaultExpenseSettings, rebaseline, rebaselineSummary } from '../../../engine'
import { buildExpenseModel } from '../../buildExpenseModel'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import { samplePlan } from '../../../testing/samplePlan'
import { MoneyFormatContext } from '../../hooks/moneyFormatContext'
import { InflationSetting } from '../../settings/InflationSetting'
import { MilestonesSetting } from '../../settings/MilestonesSetting'
import { AssumptionsView } from './AssumptionsView'
import { GoalsExplainer } from './GoalsExplainer'
import { GoalsTab } from './GoalsTab'
import { rentVsBuyCaption } from './charts/rentVsBuyCaption'
import { NetWorthHistoryChart } from './charts/NetWorthHistoryChart'
import { SavingsRateChart } from './charts/SavingsRateChart'
import { SpreadChart } from './charts/SpreadChart'
import { BreakdownExtras } from './charts/ScenarioSeriesLegend'

// Settings offers fourteen currencies, and the plan's money is named after the one the owner tracks in:
// "2026 US dollars", not "2026 euros". Nothing the Goals screens say may call it euros, or show the euro's sign.

beforeAll(() => {
  installFakeMatchMedia()
})

const USD = resolveMoneyFormat('USD', 'en-US')
const GBP = resolveMoneyFormat('GBP', 'en-GB')
const inUsd = (node: React.ReactNode) => <MoneyFormatContext.Provider value={USD}>{node}</MoneyFormatContext.Provider>
const NOT_EURO = /euro|€/i
const usdSettings = { ...defaultExpenseSettings(), currencyCode: 'USD', numberLocale: 'en-US' }

describe('the Goals screens in another currency', () => {
  it('names the assumed inflation and the milestones in the owner\'s money', () => {
    const { container } = render(inUsd(<><InflationSetting settings={usdSettings} onChange={vi.fn()} /><MilestonesSetting settings={usdSettings} onChange={vi.fn()} /></>))
    expect(container.textContent).not.toMatch(NOT_EURO)
    expect(container.textContent).toContain('Goals counts in the US dollars of each plan\'s start date (2026 US dollars, say)')
    expect(container.textContent).toContain('US dollars on the account in ten years buy less than US dollars today')
  })

  it('names it in the introduction of Assumptions', () => {
    const { container } = render(
      inUsd(<AssumptionsView accounts={[]} checkins={[]} settings={usdSettings} actions={makeActions()} onSettingsChange={vi.fn()} />),
    )
    expect(container.textContent).not.toMatch(NOT_EURO)
    expect(container.textContent).toContain('back to the US dollars of the plan\'s start year')
  })

  it('writes the glossary in the owner\'s money, with its example in the owner\'s number style', () => {
    const { container } = render(inUsd(<GoalsExplainer />))
    const text = container.textContent ?? ''
    expect(text).not.toMatch(NOT_EURO)
    expect(text).toContain("The plan's US dollars and your account")
    expect(text).toContain("'2026 US dollars' means what that many US dollars bought in 2026")
    expect(text).toContain('$100,000 of 2026 US dollars reads about $121,899 on your account in 2036')
  })

  it('keeps the euro glossary as it was for the euro', () => {
    const { container } = render(<GoalsExplainer />)
    expect(container.textContent).toContain('100.000 € of 2026 euros reads about 121.899 € on your account in 2036')
  })

  it('names the loan\'s euros in the rent against buying note', () => {
    const base = { upfrontCents: 6_600_000, feesCents: 600_000, priceCents: 32_435_282, startYear: 8, moneyLabel: '2026 US dollars', carryRate: 0.015, realReturn: 0.05, houseGrowth: 0.01, paymentCents: 144_172, ownCheaper: null, loanPaidOffYear: null, money: (c: number) => `$${c / 100}` }
    const text = rentVsBuyCaption({ ...base, format: USD })
    expect(text).toContain('so in these US dollars it shrinks each year')
    expect(text).not.toMatch(NOT_EURO)
  })

  it('names the euros of the old and the new start in the re-baseline summary', () => {
    const r = rebaseline(samplePlan({ housePurchaseYear: null }), { investedCents: 8_000_000, date: '2029-01-01' }, 0.02)
    const text = rebaselineSummary(r, GBP, () => '').join(' ')
    expect(text).toContain('typed in the British pounds of the old start are counted in the British pounds of the new one')
    expect(text).not.toMatch(NOT_EURO)
    expect(currencyWord(GBP)).toBe('British pounds')
  })

  it('shows no euro anywhere on the Plan, Progress and Assumptions views of a plan with a house and a check-in', async () => {
    const user = userEvent.setup()
    const dataset = makeDataset({
      goalScenarios: [makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true, planStartDate: '2020-01-01', housePurchaseYear: 5, housePriceCents: 30_000_000 })],
      wealthAccounts: [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })],
      wealthCheckins: [makeWealthCheckin({ id: 1, checkinDate: '2026-06-01', entries: [{ accountId: 1, valueCents: 20_000_000 }] })],
    })
    dataset.settings = { ...dataset.settings, currencyCode: 'USD', numberLocale: 'en-US' }
    const { container } = render(inUsd(<GoalsTab model={buildExpenseModel(dataset)} actions={makeActions()} />))
    expect(container.textContent).toMatch(/2020 US dollars/)
    expect(container.textContent).not.toMatch(NOT_EURO)
    for (const view of ['Progress', 'Assumptions']) {
      await user.click(screen.getByRole('tab', { name: view }))
      await waitFor(() => expect(container.textContent).toBeTruthy())
      expect(container.textContent).not.toMatch(NOT_EURO)
    }
  })

  it('names the owner\'s money under the balances as logged and under the investing against the plan', () => {
    const accounts = [makeWealthAccount({ id: 1, name: 'Broker', kind: 'investment' })]
    const checkins = [
      makeWealthCheckin({ id: 1, checkinDate: '2026-03-01', entries: [{ accountId: 1, valueCents: 10_000_000 }] }),
      makeWealthCheckin({ id: 2, checkinDate: '2026-06-01', entries: [{ accountId: 1, valueCents: 11_000_000 }] }),
    ]
    const { id, isActive, ...draft } = samplePlan()
    void id
    void isActive
    const { container } = render(
      inUsd(
        <>
          <NetWorthHistoryChart checkins={checkins} accounts={accounts} />
          <SavingsRateChart draft={draft} monthly={[{ month: '2026-06', investedCents: 40_000, netSavingCents: 285_695 }]} />
        </>,
      ),
    )
    expect(container.textContent).toContain('Balances as logged, in US dollars on your account on each day.')
    expect(container.textContent).toContain('In US dollars as they went through the account.')
    expect(container.textContent).not.toMatch(NOT_EURO)
  })

  it('names it on the spread card in the Nominal view, and under the purchase breakdown', () => {
    const { id, isActive, ...draft } = samplePlan()
    void id
    void isActive
    const { container } = render(inUsd(<SpreadChart draft={draft} milestones={[]} runs={200} nominal />))
    expect(container.textContent).toContain('in US dollars on your account in each year')
    expect(container.textContent).not.toMatch(NOT_EURO)
    const breakdown = {
      year: 5,
      startInvestedCents: 10_000_000,
      growthCents: 700_000,
      contributionCents: 1_200_000,
      beforePurchaseCents: 11_900_000,
      downPaymentCents: 8_000_000,
      transactionCostsCents: 0,
      totalWithdrawalCents: 8_000_000,
      endInvestedCents: 3_900_000,
      netChangeCents: -6_100_000,
    }
    const note = render(inUsd(<BreakdownExtras breakdowns={[{ id: '1', label: 'Path A', color: '#6366f1', breakdown }]} breakdownInTodaysMoney yearZeroHint={false} format={USD} />))
    expect(note.container.textContent).toContain("The purchase breakdown is in the plan's US dollars, not in the Nominal values above.")
  })
})
