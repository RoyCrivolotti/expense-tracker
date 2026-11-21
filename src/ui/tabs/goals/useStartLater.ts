import { useMemo } from 'react'
import type { ExpenseDataset } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { checkinInvestedCents } from '../../../engine'
import type { StartLater } from './StartLaterSheet'

/** What the "Start a copy later…" sheet reads from the editor: the draft as it stands, every check-in's invested total, and the create path. */
export function useStartLater(
  dataset: ExpenseDataset,
  draft: NewGoalScenario,
  create: (input: NewGoalScenario) => Promise<void>,
): StartLater {
  const { wealthCheckins, wealthAccounts, goalScenarios } = dataset
  const checkins = useMemo(
    () => wealthCheckins.map((c) => ({ investedCents: checkinInvestedCents(c, wealthAccounts), date: c.checkinDate })),
    [wealthCheckins, wealthAccounts],
  )
  return useMemo(
    () => ({ source: draft, checkins, scenarios: goalScenarios, onCreate: (input: NewGoalScenario) => void create(input) }),
    [draft, checkins, goalScenarios, create],
  )
}
