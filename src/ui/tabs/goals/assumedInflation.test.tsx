import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GoalsCard } from '../../components/GoalsCard'
import { AssumedInflationContext } from '../../hooks/assumedInflationContext'
import { CheckinList } from './CheckinList'
import { WealthSummaryCard } from './WealthSummaryCard'
import { CheckinHistoryChart } from './charts/CheckinHistoryChart'
import { NetWorthNowCard } from './charts/NetWorthNowCard'
import { ScenarioComparison } from './charts/ScenarioComparison'
import { makeDataset, makeScenario, makeWealthAccount, makeWealthCheckin } from '../../../testing/factories'

/**
 * The assumed inflation is the owner's setting and the engine has no fallback for it, so
 * every consumer has to read it. Each renders under two rates; an output that does not move
 * with the rate is a consumer that has the default baked in.
 */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

const accounts = [makeWealthAccount({ id: 1, kind: 'investment' })]
const plan = makeScenario({
  id: 1,
  name: 'Path A',
  isActive: true,
  planStartDate: '2024-01-01',
  housePriceCents: 40_000_000,
  housePurchaseYear: 2,
  annualSpendCents: 4_000_000,
})
const checkins = [
  makeWealthCheckin({ id: 1, checkinDate: '2024-07-01', entries: [{ accountId: 1, valueCents: 11_000_000 }] }),
  makeWealthCheckin({ id: 2, checkinDate: '2025-07-01', entries: [{ accountId: 1, valueCents: 13_000_000 }] }),
  makeWealthCheckin({ id: 3, checkinDate: '2026-07-01', entries: [{ accountId: 1, valueCents: 15_500_000 }] }),
]

function textAt(rate: number, ui: ReactElement): string {
  const { container, unmount } = render(
    <AssumedInflationContext.Provider value={rate}>{ui}</AssumedInflationContext.Provider>,
  )
  const text = container.textContent ?? ''
  unmount()
  return text
}

describe('components read the assumed inflation from the owner\'s setting', () => {
  it('the Progress snapshot: the on-track figure and the return hint', () => {
    const ui = <WealthSummaryCard checkins={checkins} accounts={accounts} plan={plan} />
    const low = textAt(0.02, ui)
    const high = textAt(0.06, ui)
    expect(high).not.toBe(low)
    // The hint names the rate it took off.
    expect(low).toMatch(/2,0% inflation is taken off/)
    expect(high).toMatch(/6,0% inflation is taken off/)
  })

  it('the check-in history: each row\'s gap to the plan', () => {
    const ui = <CheckinList checkins={checkins} accounts={accounts} plan={plan} canWrite={false} actions={undefined} />
    expect(textAt(0.06, ui)).not.toBe(textAt(0.02, ui))
  })

  it('"Actual vs plan": the note and the plotted check-ins', () => {
    const ui = <CheckinHistoryChart checkins={checkins} accounts={accounts} plan={plan} />
    expect(textAt(0.06, ui)).toMatch(/brought back at 6,0% a year/)
    expect(textAt(0.02, ui)).toMatch(/brought back at 2,0% a year/)
  })

  it('"Where you are today": the share of the FI target', () => {
    const { id, isActive, ...draft } = plan
    void id
    void isActive
    const ui = (
      <NetWorthNowCard
        draft={draft}
        latest={{ investedCents: 15_500_000, date: '2026-07-01' }}
        milestones={[]}
        reached={new Map()}
      />
    )
    expect(textAt(0.06, ui)).not.toBe(textAt(0.02, ui))
  })

  it('the dashboard card: the badge against the plan', () => {
    const dataset = makeDataset({ goalScenarios: [plan], wealthAccounts: accounts, wealthCheckins: checkins })
    const ui = <GoalsCard dataset={dataset} onOpenGoals={() => {}} />
    expect(textAt(0.06, ui)).not.toBe(textAt(0.02, ui))
  })

  it('the comparison table: net worth carries the house and the mortgage', () => {
    const { id, isActive, ...draft } = plan
    void id
    void isActive
    const ui = <ScenarioComparison scenarios={[plan]} draft={draft} />
    expect(textAt(0.06, ui)).not.toBe(textAt(0.02, ui))
  })
})
