import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ExpenseDataset, GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { ExpenseActions } from '../../actions'
import { duplicateScenario, pickScenarioColor } from '../../../engine'
import { bootstrapEditor, differsFrom, hasDetachedEdits, rebaseDraft, scenarioToDraft } from './scenarioDraft'
import { useHiddenLines } from './useHiddenLines'
import { useScenarioSave } from './useScenarioSave'

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
  /** Leaving would drop edits: the loaded scenario has some (`dirty`), or a detached draft does. */
  unsaved: boolean
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

  // Two different "current" scenarios: the one loaded in the editor (activeId), and the
  // owner's plan, which Progress measures against. Exploring a path must not change
  // what you are being measured against.
  const activeScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === loadedId) ?? null,
    [dataset.goalScenarios, loadedId],
  )
  // A scenario deleted while it is loaded is not loaded any more: the numbers on screen stay,
  // as a draft with no saved scenario behind it, which is what the tabs and the buttons must
  // say. Reading the id from the state alone left them naming one that no longer exists.
  const activeId = activeScenario?.id ?? null
  const dirty = useMemo(
    () => activeScenario !== null && differsFrom(draft, activeScenario),
    [activeScenario, draft],
  )
  const { hiddenIds, onToggleVisible } = useHiddenLines(dataset.goalScenarios, activeScenario, dirty)
  // A detached draft has no saved scenario of its own, so loading another one would drop
  // its edits just as surely; it is measured against the scenario it came from.
  const baseScenario = useMemo(
    () => dataset.goalScenarios.find((s) => s.id === baseId) ?? null,
    [dataset.goalScenarios, baseId],
  )
  const unsaved = dirty || hasDetachedEdits(activeScenario, baseScenario, draft)

  const selectScenario = useCallback((scenario: GoalScenario) => {
    setActiveId(scenario.id)
    setBaseId(scenario.id)
    setSynced(scenario)
    setDraft(scenarioToDraft(scenario))
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
      if (unsaved) {
        setPendingSelect(scenario)
        setDiscardOpen(true)
        return
      }
      selectScenario(scenario)
    },
    [activeId, unsaved, selectScenario],
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

  const { save: onSaveChanges, saving } = useScenarioSave(actions, activeId, draft, draft.name, activeScenario)

  const onDiscard = useCallback(() => {
    if (activeScenario) setDraft(scenarioToDraft(activeScenario))
  }, [activeScenario])

  // What the editor held when a create started, to tell whether anything was touched while it ran.
  const live = useRef({ activeId, draft })
  useEffect(() => {
    live.current = { activeId, draft }
  })
  const creatingNow = useRef(false)
  const [creating, setCreating] = useState(false)
  // One create at a time, and the new scenario is opened only if nothing was touched while it was
  // being made: opening it replaces the draft, so an edit made in the meantime, or another
  // scenario opened, would be dropped without a word. A second press is the same copy twice.
  const createAndOpen = useCallback(
    async (input: NewGoalScenario) => {
      if (!actions || creatingNow.current) return
      creatingNow.current = true
      setCreating(true)
      const started = live.current
      try {
        const scenario = await actions.createScenario(input)
        if (live.current.activeId === started.activeId && live.current.draft === started.draft) selectScenario(scenario)
      } finally {
        creatingNow.current = false
        setCreating(false)
      }
    },
    [actions, selectScenario],
  )

  const saveDraftAs = useCallback(
    (name: string) => {
      const used = dataset.goalScenarios.map((s) => s.color)
      // The draft's own colour when no scenario has it; saved from another scenario's draft it is
      // that scenario's, and two lines of one colour cannot be told apart.
      const color = used.includes(draft.color) ? pickScenarioColor(used) : draft.color
      return createAndOpen({ ...draft, name, color, sortOrder: dataset.goalScenarios.length })
    },
    [createAndOpen, draft, dataset.goalScenarios],
  )

  const onSaveDraft = useCallback(
    (name: string) => {
      void saveDraftAs(name)
    },
    [saveDraftAs],
  )

  const onDuplicate = useCallback(() => {
    const { goalScenarios } = dataset
    void createAndOpen(
      duplicateScenario(
        draft,
        goalScenarios.length,
        goalScenarios.map((s) => s.color),
        goalScenarios.map((s) => s.name),
      ),
    )
  }, [createAndOpen, dataset, draft])

  return {
    activeId,
    draft,
    deferredDraft,
    hiddenIds,
    activeScenario,
    dirty,
    unsaved,
    saving,
    creating,
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
    onDuplicate,
    onDiscard,
  }
}
