import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { draftFromDataset } from './goalsDefaults'
import { initialEditorScenario } from './scenarioSelection'
import { useScenarioSave } from './useScenarioSave'

function scenarioToDraft(s: GoalScenario): NewGoalScenario {
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
function differsFrom(draft: NewGoalScenario, saved: GoalScenario): boolean {
  if (draft.name !== saved.name) return true
  if (JSON.stringify(draft.lifeEvents) !== JSON.stringify(saved.lifeEvents)) return true
  return EDIT_KEYS.some((k) => draft[k] !== saved[k])
}

/** A detached draft (no scenario loaded) holding edits its origin does not. */
function hasDetachedEdits(
  loaded: GoalScenario | null,
  base: GoalScenario | null,
  draft: NewGoalScenario,
): boolean {
  return loaded === null && base !== null && differsFrom(draft, base)
}

function bootstrapEditor(
  dataset: ExpenseDataset,
  avgSaving: number,
): { activeId: number | null; draft: NewGoalScenario } {
  const first = initialEditorScenario(dataset.goalScenarios)
  if (first) return { activeId: first.id, draft: scenarioToDraft(first) }
  return { activeId: null, draft: draftFromDataset(dataset, avgSaving) }
}

/**
 * The question asked before loading another scenario over unsaved edits. `pending` is held
 * apart from `open` so the sheet keeps its text while it animates out.
 */
export interface DiscardPrompt {
  pending: GoalScenario | null
  open: boolean
  /** The draft has no saved scenario to "save changes" to. */
  detached: boolean
  /** What the edits are to: the loaded scenario, else the draft. */
  name: string
  onConfirm: () => void
  onCancel: () => void
}

export interface ScenarioEditor {
  /** The scenario loaded in the editor; null while the draft is detached from any. */
  activeId: number | null
  /** What the controls read and write: instant. */
  draft: NewGoalScenario
  /** What the charts read. It trails the draft, so a slider never waits on a projection. */
  deferredDraft: NewGoalScenario
  hiddenIds: ReadonlySet<number>
  activeScenario: GoalScenario | null
  /** The loaded scenario has edits that are not saved. */
  dirty: boolean
  saving: boolean
  discardPrompt: DiscardPrompt
  patchDraft: (patch: Partial<NewGoalScenario>) => void
  /** Loads a scenario into the editor, dropping the draft it replaces. */
  selectScenario: (scenario: GoalScenario) => void
  /** Loads a scenario, asking first if that would drop edits. */
  onSelectScenario: (scenario: GoalScenario) => void
  onSelectEditing: () => void
  onToggleVisible: (id: number) => void
  onActivate: () => void
  onSaveChanges: () => void
  /** Saves the draft as a new scenario with this name and loads it. */
  onSaveDraft: (name: string) => void
  onDiscard: () => void
}

/**
 * The scenario editor's state: which scenario is loaded, the draft being edited, and what
 * can be done with it. `avgSaving` seeds the contribution of a first draft.
 */
export function useScenarioEditor(
  dataset: ExpenseDataset,
  actions: ExpenseActions | undefined,
  avgSaving: number,
): ScenarioEditor {
  const [activeId, setActiveId] = useState<number | null>(
    () => bootstrapEditor(dataset, avgSaving).activeId,
  )
  // The saved scenario the draft was last loaded from. Detaching to "Unsaved draft" clears
  // activeId but keeps the edits, and this is what they are still measured against.
  const [baseId, setBaseId] = useState<number | null>(
    () => bootstrapEditor(dataset, avgSaving).activeId,
  )
  const [draft, setDraft] = useState<NewGoalScenario>(
    () => bootstrapEditor(dataset, avgSaving).draft,
  )
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set())
  // Controls read `draft` (instant); charts read the deferred copy so dragging a
  // slider never blocks on the projection recompute (keeps the thumb at 60fps).
  const deferredDraft = useDeferredValue(draft)

  // Editing keeps the saved plan active; we track dirtiness rather than
  // detaching to a fresh draft, so the user can save changes in place.
  const patchDraft = useCallback((patch: Partial<NewGoalScenario>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  // Two different "current" scenarios: the one loaded in the editor (activeId), and the
  // owner's plan, which Progress measures against. Exploring a path must not change
  // what you are being measured against.
  const activeScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === activeId) ?? null,
    [dataset.goalScenarios, activeId],
  )
  const dirty = useMemo(
    () => activeScenario !== null && differsFrom(draft, activeScenario),
    [activeScenario, draft],
  )
  // A detached draft has no saved scenario of its own, so loading another one would drop
  // its edits just as surely; it is measured against the scenario it came from.
  const baseScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === baseId) ?? null,
    [dataset.goalScenarios, baseId],
  )
  const detachedEdits = hasDetachedEdits(activeScenario, baseScenario, draft)

  const selectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setBaseId(scenario.id)
    setDraft(scenarioToDraft(scenario))
    // The loaded scenario is always drawn as the editing line, so a hidden flag on it would
    // only leave the chip and legend saying two things at once.
    setHiddenIds((prev) => {
      if (!prev.has(scenario.id)) return prev
      const next = new Set(prev)
      next.delete(scenario.id)
      return next
    })
  }, [])

  const onActivate = useCallback(() => {
    if (!actions || activeId == null) return
    void actions.activateScenario(activeId)
  }, [actions, activeId])

  // Loading another scenario replaces the draft, so unsaved edits are held back behind a
  // question. Held as its own value so the sheet keeps its text while it animates out.
  const [pendingSelect, setPendingSelect] = useState<GoalScenario | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const onSelectScenario = useCallback(
    (scenario: GoalScenario) => {
      if (scenario.id === activeId) return
      if (dirty || detachedEdits) {
        setPendingSelect(scenario)
        setDiscardOpen(true)
        return
      }
      selectScenario(scenario)
    },
    [activeId, dirty, detachedEdits, selectScenario],
  )
  const onDiscardAndSelect = useCallback(() => {
    setDiscardOpen(false)
    if (pendingSelect) selectScenario(pendingSelect)
  }, [pendingSelect, selectScenario])
  const onCancelDiscard = useCallback(() => setDiscardOpen(false), [])

  // Switching to the unsaved draft keeps the current edits, so it needs no question.
  const onSelectEditing = useCallback(() => {
    setActiveId(null)
  }, [])

  const { save: onSaveChanges, saving } = useScenarioSave(actions, activeId, draft, draft.name)

  const onDiscard = useCallback(() => {
    if (activeScenario) setDraft(scenarioToDraft(activeScenario))
  }, [activeScenario])

  const onToggleVisible = useCallback((id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const saveDraftAs = useCallback(
    async (name: string) => {
      if (!actions) return
      const scenario = await actions.createScenario({
        ...draft,
        name,
        sortOrder: dataset.goalScenarios.length,
      })
      selectScenario(scenario)
    },
    [actions, draft, dataset.goalScenarios, selectScenario],
  )

  const onSaveDraft = useCallback(
    (name: string) => {
      void saveDraftAs(name)
    },
    [saveDraftAs],
  )

  return {
    activeId,
    draft,
    deferredDraft,
    hiddenIds,
    activeScenario,
    dirty,
    saving,
    discardPrompt: {
      pending: pendingSelect,
      open: discardOpen,
      detached: activeId === null,
      name: activeScenario?.name ?? draft.name,
      onConfirm: onDiscardAndSelect,
      onCancel: onCancelDiscard,
    },
    patchDraft,
    selectScenario,
    onSelectScenario,
    onSelectEditing,
    onToggleVisible,
    onActivate,
    onSaveChanges,
    onSaveDraft,
    onDiscard,
  }
}
