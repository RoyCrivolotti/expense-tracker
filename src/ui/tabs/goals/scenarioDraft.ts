import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { draftFromDataset } from './goalsDefaults'
import { initialEditorScenario } from './scenarioSelection'

/** A saved scenario as an editable draft: everything but the row's own identity. */
export function scenarioToDraft(s: GoalScenario): NewGoalScenario {
  const { id, isActive, ...rest } = s
  void id
  void isActive
  return rest
}

// Fields the controls and the header can change; used to detect unsaved edits to a saved plan.
const EDIT_KEYS = [
  'color',
  'startInvestedCents',
  'monthlyContributionCents',
  'annualContributionGrowth',
  'expectedRealReturn',
  'horizonYears',
  'housePriceCents',
  'downPaymentFraction',
  'housePurchaseYear',
  'transactionCostsCents',
  'mortgageTermYears',
  'mortgageRateAnnual',
  'houseAppreciationRate',
  'rentMonthlyCents',
  'annualSpendCents',
  'safeWithdrawalRate',
  'planStartDate',
] as const satisfies readonly (keyof NewGoalScenario)[]

/** Whether the draft holds edits its saved scenario does not. */
export function differsFrom(draft: NewGoalScenario, saved: GoalScenario): boolean {
  if (draft.name !== saved.name) return true
  if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(saved.lifeEvents)) return true
  return EDIT_KEYS.some((k) => draft[k] !== saved[k])
}

/** A detached draft (no scenario loaded) holding edits its origin does not. */
export function hasDetachedEdits(
  loaded: GoalScenario | null,
  base: GoalScenario | null,
  draft: NewGoalScenario,
): boolean {
  return loaded === null && base !== null && differsFrom(draft, base)
}

/** What the editor opens on: the plan or the last scenario saved, else a draft seeded from the data. */
export function bootstrapEditor(
  dataset: ExpenseDataset,
  avgSaving: number,
): { activeId: number | null; draft: NewGoalScenario } {
  const first = initialEditorScenario(dataset.goalScenarios)
  if (first) return { activeId: first.id, draft: scenarioToDraft(first) }
  return { activeId: null, draft: draftFromDataset(dataset, avgSaving) }
}
