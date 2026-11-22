import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { planFromToday, type PlanFromToday } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { samplePlan } from '../../../../testing/samplePlan'
import { scenarioToDraft } from '../scenarioDraft'
import { ScenarioComparison } from './ScenarioComparison'

/**
 * Every scenario here starts on one day, the case nearly every owner is in. The recorded text is what
 * the table showed before scenarios were read on a shared calendar, so any change to the reading of
 * later starts that leaks into this case fails here, in any column, window or form of the table.
 */
interface Case {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  includeDraft: boolean
  fromToday?: PlanFromToday | null
  embedded?: boolean
}

const START = '2026-01-01'
const plan = samplePlan({ id: 1, name: 'Path A: Sample', planStartDate: START })
const houseNow = samplePlan({
  id: 2,
  name: 'Path B: House now',
  housePurchaseYear: 0,
  isActive: false,
  color: '#ef4444',
  annualSpendCents: 1_200_000,
})
const neverBuys = samplePlan({
  id: 3,
  name: 'Path C: Rent',
  housePurchaseYear: null,
  horizonYears: 12,
  isActive: false,
  color: '#22c55e',
  contributionSchedule: [{ from: '2028-04', monthlyCents: 150_000 }],
  lifeEvents: [{ year: 3, amountCents: -1_000_000, label: 'Car' }],
})
const undated = makeScenario({
  id: 4,
  name: 'Undated',
  planStartDate: null,
  horizonYears: 25,
  annualSpendCents: 2_000_000,
})

const CASES: Record<string, Case> = {
  'three dated paths, unequal horizons, a loaded plan': {
    scenarios: [plan, houseNow, neverBuys],
    draft: scenarioToDraft(plan),
    includeDraft: false,
  },
  'the same with an edited draft': {
    scenarios: [plan, houseNow, neverBuys],
    draft: { ...scenarioToDraft(plan), monthlyContributionCents: 120_000 },
    includeDraft: true,
  },
  'with the plan from today': {
    scenarios: [plan, houseNow],
    draft: scenarioToDraft(plan),
    includeDraft: false,
    fromToday: planFromToday(plan, { investedCents: 9_000_000, date: '2027-03-05' }, 0.02),
  },
  'embedded, as on a phone': {
    scenarios: [plan, neverBuys],
    draft: scenarioToDraft(plan),
    includeDraft: false,
    embedded: true,
  },
  'no start dates at all': {
    scenarios: [undated, makeScenario({ id: 5, name: 'Undated house', planStartDate: null, housePurchaseYear: 5 })],
    draft: { ...scenarioToDraft(undated), name: 'Draft' },
    includeDraft: true,
  },
  'one undated beside dated ones': { scenarios: [plan, undated], draft: scenarioToDraft(plan), includeDraft: false },
}

/** The hint and every cell, row by row, at each window the table offers. */
function readTable(c: Case): string[] {
  render(
    <ScenarioComparison
      scenarios={c.scenarios}
      draft={c.draft}
      includeDraft={c.includeDraft}
      fromToday={c.fromToday ?? null}
      embedded={c.embedded ?? false}
    />,
  )
  const group = screen.getByRole('radiogroup', { name: 'Comparison year' })
  const windows = within(group)
    .getAllByRole('radio')
    .map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '')
  return windows.flatMap((label) => {
    fireEvent.click(within(group).getByRole('radio', { name: label }))
    const hint = document.querySelector('p')?.textContent ?? ''
    const rows = screen
      .getAllByRole('row')
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent).join(' | '))
    return [`[${label}] ${hint}`, ...rows]
  })
}

describe('the comparison table when every scenario starts on one day', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(`shows what it always has: ${name}`, () => {
      expect(readTable(c)).toMatchSnapshot()
    })
  }
})
