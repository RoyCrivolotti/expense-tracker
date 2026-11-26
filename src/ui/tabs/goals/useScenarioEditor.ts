import { useCallback, useDeferredValue, useState } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { bootstrapEditor, differsFrom, rebaseDraft, scenarioToDraft } from './scenarioDraft'
import { useDiscardPrompt } from './useDiscardPrompt'
import { useEditorStanding } from './useEditorStanding'
import { useScenarioCreate } from './useScenarioCreate'
import { useScenarioSave } from './useScenarioSave'
import type { StartLater } from './StartLaterSheet'

/**
 * The question asked before loading another scenario over unsaved edits. `pending` is held
 * apart from `open` so the sheet keeps its text while it animates out.
 */
export interface DiscardPrompt {
  pending: GoalScenario | null
  open: boolean
  /** The draft has no saved scenario to "save changes" to. */
  detached: boolean
  /** Edits can be saved at all: false in a read-only session. */
  canSave: boolean
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
  /** Leaving would drop edits: the loaded scenario has some (`dirty`), or a detached draft does. */
  unsaved: boolean
  /** Edits can be saved: false in a read-only session, where they can still be made and are lost on leaving. */
  canSave: boolean
  saving: boolean
  /** A scenario is being created (a duplicate, or the draft saved as one): a second press waits. */
  creating: boolean
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
  /** Saves a copy of the draft as a new scenario, and opens it. */
  onDuplicate: () => void
  onDiscard: () => void
  /** What "Start a copy later…" copies and how it saves the copy, through the same create path as Duplicate. */
  startLater: StartLater
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
  const [first] = useState(() => bootstrapEditor(dataset, avgSaving))
  const [loadedId, setActiveId] = useState<number | null>(first.activeId)
  // The saved scenario the draft was last loaded from. Detaching to "Unsaved draft" clears
  // activeId but keeps the edits, and this is what they are still measured against.
  const [baseId, setBaseId] = useState<number | null>(first.activeId)
  const [draft, setDraft] = useState<NewGoalScenario>(first.draft)
  // The saved row the draft is built on: what it was loaded from, or last rebased onto. When the
  // data brings that row back changed (a refresh after another device saved), the draft's own
  // edits are put on the new row, instead of the draft going on as an older copy of it that
  // shows as edited and writes its old values back over the new ones on Save.
  const [synced, setSynced] = useState<GoalScenario | null>(
    () => dataset.goalScenarios.find((s) => s.id === first.activeId) ?? null,
  )
  const now = synced === null ? null : (dataset.goalScenarios.find((s) => s.id === synced.id) ?? null)
  if (synced !== null && now !== null && now !== synced && differsFrom(scenarioToDraft(synced), now)) {
    setDraft((prev) => rebaseDraft(prev, synced, now))
    setSynced(now)
  }
  // Controls read `draft` (instant); charts read the deferred copy so dragging a
  // slider never blocks on the projection recompute (keeps the thumb at 60fps).
  const deferredDraft = useDeferredValue(draft)

  // Editing keeps the saved plan active; we track dirtiness rather than
  // detaching to a fresh draft, so the user can save changes in place.
  const patchDraft = useCallback((patch: Partial<NewGoalScenario>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  const { activeScenario, activeId, dirty, hiddenIds, onToggleVisible, clearBlank, unsaved } = useEditorStanding(
    dataset,
    { loadedId, baseId, draft },
    first,
  )

  const selectScenario = useCallback(
    (scenario: GoalScenario) => {
      clearBlank()
      setActiveId(scenario.id)
      setBaseId(scenario.id)
      setSynced(scenario)
      setDraft(scenarioToDraft(scenario))
    },
    [clearBlank],
  )

  const onActivate = useCallback(() => {
    if (!actions || activeId == null) return
    void actions.activateScenario(activeId)
  }, [actions, activeId])

  const { onSelectScenario, discardPrompt } = useDiscardPrompt({
    activeId,
    unsaved,
    selectScenario,
    canSave: actions !== undefined,
    name: activeScenario?.name ?? draft.name,
  })

  // Switching to the unsaved draft keeps the current edits, so it needs no question.
  const onSelectEditing = useCallback(() => {
    setActiveId(null)
  }, [])

  const { save: onSaveChanges, saving } = useScenarioSave(actions, activeId, draft, draft.name, activeScenario)

  const onDiscard = useCallback(() => {
    if (activeScenario) setDraft(scenarioToDraft(activeScenario))
  }, [activeScenario])

  const { creating, onSaveDraft, onDuplicate, startLater } = useScenarioCreate(
    actions,
    dataset,
    { activeId, draft },
    selectScenario,
  )

  return {
    activeId,
    draft,
    deferredDraft,
    hiddenIds,
    activeScenario,
    dirty,
    unsaved,
    canSave: actions !== undefined,
    saving,
    creating,
    discardPrompt,
    patchDraft,
    selectScenario,
    onSelectScenario,
    onSelectEditing,
    onToggleVisible,
    onActivate,
    onSaveChanges,
    onSaveDraft,
    onDuplicate,
    onDiscard,
    startLater,
  }
}
