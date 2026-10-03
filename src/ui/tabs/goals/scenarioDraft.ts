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

/** The keys the draft has changed from its saved scenario. */
export function editedKeys(draft: NewGoalScenario, saved: GoalScenario): (keyof NewGoalScenario)[] {
  const keys: (keyof NewGoalScenario)[] = EDIT_KEYS.filter((k) => draft[k] !== saved[k])
  if (draft.name !== saved.name) keys.push('name')
  if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(saved.lifeEvents)) keys.push('lifeEvents')
  return keys
}

/** Whether the draft holds edits its saved scenario does not. */
export function differsFrom(draft: NewGoalScenario, saved: GoalScenario): boolean {
  return editedKeys(draft, saved).length > 0
}

function pick(draft: NewGoalScenario, keys: (keyof NewGoalScenario)[]): Partial<NewGoalScenario> {
  return Object.fromEntries(keys.map((k) => [k, draft[k]]))
}

/**
 * What to write to save the draft over its scenario: the edits made to it and nothing else. The
 * whole draft would write back what the draft was loaded with too, over whatever another device
 * has saved since.
 */
export function editedPatch(draft: NewGoalScenario, saved: GoalScenario): Partial<NewGoalScenario> {
  return pick(draft, editedKeys(draft, saved))
}

/**
 * The draft's edits (what it holds that `from` does not) put on `onto`, the scenario as it is
 * saved now. A clean draft becomes `onto`; one being edited keeps its edits and takes
 * everything else from the new row, so a change saved elsewhere is not shown as an edit here and
 * not written back over.
 */
export function rebaseDraft(draft: NewGoalScenario, from: GoalScenario, onto: GoalScenario): NewGoalScenario {
  return { ...scenarioToDraft(onto), ...pick(draft, editedKeys(draft, from)) }
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
