import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { bootstrapEditor } from './scenarioDraft'
import type * as ScenarioDraft from './scenarioDraft'
import { useScenarioEditor, type ScenarioEditor } from './useScenarioEditor'
import type { GoalScenario } from '../../../types'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

// Counts how often the first draft is built; it is still the real thing.
vi.mock('./scenarioDraft', async (importOriginal) => {
  const real = await importOriginal<typeof ScenarioDraft>()
  return { ...real, bootstrapEditor: vi.fn(real.bootstrapEditor) }
})

function setup() {
  const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
  const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
  let dataset = makeDataset({ goalScenarios: [plan, other] })
  const actions = makeActions()
  const seen: ScenarioEditor[] = []
  const hook = renderHook(() => {
    const editor = useScenarioEditor(dataset, actions, 0)
    seen.push(editor)
    return editor
  })
  // The app patches its data before a create resolves, so the editor never selects a scenario
  // the data does not have yet.
  const setData = (next: typeof dataset) => {
    dataset = next
  }
  const addToData = (scenario: GoalScenario) => {
    dataset = makeDataset({ goalScenarios: [...dataset.goalScenarios, scenario] })
    hook.rerender()
  }
  return { ...hook, seen, plan, other, actions, addToData, setData }
}

describe('useScenarioEditor', () => {
  describe('when the saved scenario changes under it', () => {
    /** The data a refresh brings back after another device re-baselined the plan. */
    function refreshWith(setupResult: ReturnType<typeof setup>, change: Partial<GoalScenario>) {
      const { rerender, setData, plan, other } = setupResult
      setData(makeDataset({ goalScenarios: [{ ...plan, ...change }, other] }))
      rerender()
    }

    it('shows a clean draft as the new row instead of as edited', () => {
      const s = setup()
      refreshWith(s, { startInvestedCents: 9_000_000, planStartDate: '2027-01-01' })

      expect(s.result.current.draft.startInvestedCents).toBe(9_000_000)
      expect(s.result.current.draft.planStartDate).toBe('2027-01-01')
      expect(s.result.current.dirty).toBe(false)
    })

    it('keeps an edit and takes the rest from the new row, and saves only the edit', async () => {
      const s = setup()
      act(() => s.result.current.patchDraft({ monthlyContributionCents: 77_000 }))
      refreshWith(s, { startInvestedCents: 9_000_000 })

      expect(s.result.current.draft.monthlyContributionCents).toBe(77_000)
      expect(s.result.current.draft.startInvestedCents).toBe(9_000_000)
      expect(s.result.current.dirty).toBe(true)

      await act(async () => {
        s.result.current.onSaveChanges()
        await Promise.resolve()
      })
      expect(s.actions.updateScenario).toHaveBeenCalledWith(s.plan.id, { monthlyContributionCents: 77_000 })
    })

    it('leaves the draft alone when the row comes back the same', () => {
      const s = setup()
      const before = s.result.current.draft
      refreshWith(s, {})

      expect(s.result.current.draft).toBe(before)
    })

    it('goes on from the new row after a save', () => {
      const s = setup()
      act(() => s.result.current.patchDraft({ monthlyContributionCents: 77_000 }))
      // The write came back: the saved row is now the edit.
      refreshWith(s, { monthlyContributionCents: 77_000 })

      expect(s.result.current.dirty).toBe(false)
      expect(s.result.current.draft.monthlyContributionCents).toBe(77_000)
    })
  })

  it('opens on the plan, with a draft of it', () => {
    const { result, plan } = setup()

    expect(result.current.activeId).toBe(plan.id)
    expect(result.current.activeScenario).toEqual(plan)
    expect(result.current.draft.name).toBe('Path A')
    expect(result.current.dirty).toBe(false)
  })

  it('gives the controls an edit at once and the charts one render later', () => {
    const { result, seen } = setup()
    const before = result.current.draft.monthlyContributionCents
    seen.length = 0

    act(() => result.current.patchDraft({ monthlyContributionCents: before + 1 }))

    // A slider thumb waits on the render that draws the controls, so the charts, which
    // are slow, come in a render of their own rather than holding it up.
    const first = seen[0]!
    expect(first.draft.monthlyContributionCents).toBe(before + 1)
    expect(first.deferredDraft.monthlyContributionCents).toBe(before)
    expect(result.current.deferredDraft.monthlyContributionCents).toBe(before + 1)
  })

  it('keeps what memoised charts and the editor lean on steady through an edit', () => {
    const { result } = setup()
    const { patchDraft, selectScenario, onToggleVisible, onSelectEditing, hiddenIds, activeScenario } =
      result.current

    act(() => patchDraft({ monthlyContributionCents: 1 }))

    expect(result.current.dirty).toBe(true)
    expect(result.current.patchDraft).toBe(patchDraft)
    expect(result.current.selectScenario).toBe(selectScenario)
    expect(result.current.onToggleVisible).toBe(onToggleVisible)
    expect(result.current.onSelectEditing).toBe(onSelectEditing)
    expect(result.current.hiddenIds).toBe(hiddenIds)
    expect(result.current.activeScenario).toBe(activeScenario)
  })

  it('saves the draft as a new scenario, last in the list, and loads it', async () => {
    const { result, actions, addToData } = setup()
    vi.mocked(actions.createScenario).mockImplementation(() => {
      const created = makeScenario({ id: 9, name: 'Path C', sortOrder: 2 })
      addToData(created)
      return Promise.resolve(created)
    })
    act(() => result.current.patchDraft({ monthlyContributionCents: 5 }))

    await act(async () => {
      result.current.onSaveDraft('Path C')
      await Promise.resolve()
    })

    expect(actions.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Path C', sortOrder: 2, monthlyContributionCents: 5 }),
    )
    expect(result.current.activeId).toBe(9)
    expect(result.current.draft.name).toBe('Path C')
  })
  describe('creating a scenario', () => {
    /** A create that stays in flight until the test lets it land, with the row the data would get. */
    function slowCreate(s: ReturnType<typeof setup>, created = makeScenario({ id: 9, name: 'Path A (copy)', sortOrder: 2 })) {
      let land!: () => void
      vi.mocked(s.actions.createScenario).mockImplementation(
        () =>
          new Promise((resolve) => {
            land = () => {
              s.addToData(created)
              resolve(created)
            }
          }),
      )
      return {
        land: () =>
          act(async () => {
            land()
            await Promise.resolve()
          }),
      }
    }

    it('makes one copy for a double press, not two', async () => {
      const s = setup()
      const { land } = slowCreate(s)

      act(() => s.result.current.onDuplicate())
      act(() => s.result.current.onDuplicate())
      expect(s.actions.createScenario).toHaveBeenCalledTimes(1)
      expect(s.result.current.creating).toBe(true)

      await land()
      expect(s.result.current.creating).toBe(false)
      expect(s.result.current.activeId).toBe(9)
    })

    it('opens the copy when nothing was touched while it was made', async () => {
      const s = setup()
      const { land } = slowCreate(s)

      act(() => s.result.current.onDuplicate())
      await land()

      expect(s.result.current.activeId).toBe(9)
    })

    it('leaves an edit made while it was being made where it is, and does not open the copy over it', async () => {
      const s = setup()
      const { land } = slowCreate(s)

      act(() => s.result.current.onDuplicate())
      act(() => s.result.current.patchDraft({ monthlyContributionCents: 99_900 }))
      await land()

      expect(s.result.current.activeId).toBe(s.plan.id)
      expect(s.result.current.draft.monthlyContributionCents).toBe(99_900)
      expect(s.result.current.dirty).toBe(true)
    })

    it('does not jump to the copy if another scenario was opened while it was made', async () => {
      const s = setup()
      const { land } = slowCreate(s)

      act(() => s.result.current.onDuplicate())
      act(() => s.result.current.onSelectScenario(s.other))
      await land()

      expect(s.result.current.activeId).toBe(s.other.id)
    })

    it('numbers a copy past the ones that exist', () => {
      const s = setup()
      s.addToData(makeScenario({ id: 5, name: 'Path A (copy)', sortOrder: 2 }))

      act(() => s.result.current.onDuplicate())

      expect(s.actions.createScenario).toHaveBeenCalledWith(expect.objectContaining({ name: 'Path A (copy 2)' }))
    })

    it('gives a draft saved as a new scenario a colour no scenario has', () => {
      const s = setup()

      act(() => s.result.current.onSaveDraft('Alt'))

      // The draft was loaded from the plan, so it has the plan's colour: two lines of one colour cannot be told apart.
      const color = vi.mocked(s.actions.createScenario).mock.calls[0]?.[0]?.color
      expect([s.plan.color, s.other.color]).not.toContain(color)
    })

    it('keeps the draft its own colour when no scenario has it', () => {
      const s = setup()
      act(() => s.result.current.patchDraft({ color: '#123456' }))

      act(() => s.result.current.onSaveDraft('Alt'))

      expect(vi.mocked(s.actions.createScenario).mock.calls[0]?.[0]?.color).toBe('#123456')
    })
  })

  it('builds the first draft once, not once for each piece of state it seeds', () => {
    vi.mocked(bootstrapEditor).mockClear()

    setup()

    expect(bootstrapEditor).toHaveBeenCalledTimes(1)
  })

  describe('a scenario that is deleted while it is loaded', () => {
    function setupWithRerender() {
      const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
      const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
      const actions = makeActions()
      return {
        plan,
        other,
        ...renderHook(
          ({ scenarios }) => useScenarioEditor(makeDataset({ goalScenarios: scenarios }), actions, 0),
          { initialProps: { scenarios: [plan, other] } },
        ),
      }
    }

    it('leaves the numbers on screen as a draft with no saved scenario behind it', () => {
      const { result, rerender, other } = setupWithRerender()
      expect(result.current.activeId).toBe(1)

      rerender({ scenarios: [other] })

      expect(result.current.activeId).toBeNull()
      expect(result.current.activeScenario).toBeNull()
      expect(result.current.draft.name).toBe('Path A')
      expect(result.current.dirty).toBe(false)
      expect(result.current.discardPrompt.detached).toBe(true)
    })

    it('is loaded again once the draft is saved as a new scenario', () => {
      const { result, rerender, other } = setupWithRerender()
      rerender({ scenarios: [other] })
      const saved = makeScenario({ id: 9, name: 'Path A', sortOrder: 1 })

      rerender({ scenarios: [other, saved] })
      act(() => result.current.selectScenario(saved))

      expect(result.current.activeId).toBe(9)
      expect(result.current.activeScenario).toEqual(saved)
    })
  })

  describe('a draft with no saved scenario behind it', () => {
    const noScenarios = () => renderHook(() => useScenarioEditor(makeDataset({ goalScenarios: [] }), makeActions(), 0))

    it('is not unsaved until something is edited', () => {
      const { result } = noScenarios()

      expect(result.current.activeId).toBeNull()
      expect(result.current.unsaved).toBe(false)
    })

    it.each([
      ['an amount', { monthlyContributionCents: 12_345 }],
      ['a percentage', { expectedRealReturn: 0.06 }],
      ['the colour', { color: '#123456' }],
      ['the name', { name: 'Mine' }],
      ['the life events', { lifeEvents: [{ label: 'Bonus', year: 3, amountCents: 100_000 }] }],
    ])('is unsaved once %s is edited', (_what, patch) => {
      const { result } = noScenarios()

      act(() => result.current.patchDraft(patch))

      expect(result.current.unsaved).toBe(true)
      expect(result.current.dirty).toBe(false)
      expect(result.current.discardPrompt.detached).toBe(true)
    })

    it('is not unsaved again when the edit is put back by hand', () => {
      const { result } = noScenarios()
      const start = result.current.draft.monthlyContributionCents

      act(() => result.current.patchDraft({ monthlyContributionCents: 99_900 }))
      expect(result.current.unsaved).toBe(true)
      act(() => result.current.patchDraft({ monthlyContributionCents: start }))

      expect(result.current.unsaved).toBe(false)
    })

    it('is not unsaved once it is saved as a scenario, and is measured against that scenario from then on', () => {
      const { result, rerender } = renderHook(
        ({ scenarios }) => useScenarioEditor(makeDataset({ goalScenarios: scenarios }), makeActions(), 0),
        { initialProps: { scenarios: [] as GoalScenario[] } },
      )
      act(() => result.current.patchDraft({ monthlyContributionCents: 99_900 }))
      const saved = makeScenario({ id: 9, name: 'New plan', monthlyContributionCents: 99_900 })

      rerender({ scenarios: [saved] })
      act(() => result.current.selectScenario(saved))

      expect(result.current.unsaved).toBe(false)
      act(() => result.current.patchDraft({ monthlyContributionCents: 1 }))
      expect(result.current.unsaved).toBe(true)
      expect(result.current.dirty).toBe(true)
    })

    it('is what a draft is once its scenario is deleted: untouched numbers are not unsaved, edits are', () => {
      const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
      const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
      const { result, rerender } = renderHook(
        ({ scenarios }) => useScenarioEditor(makeDataset({ goalScenarios: scenarios }), makeActions(), 0),
        { initialProps: { scenarios: [plan, other] } },
      )
      rerender({ scenarios: [other] })
      expect(result.current.activeId).toBeNull()
      expect(result.current.unsaved).toBe(false)

      act(() => result.current.patchDraft({ horizonYears: 12 }))
      expect(result.current.unsaved).toBe(true)

      act(() => result.current.patchDraft({ horizonYears: plan.horizonYears }))
      expect(result.current.unsaved).toBe(false)
    })

    it('is measured against the scenario that was opened after it, not against the old start', () => {
      const plan = makeScenario({ id: 1, name: 'Path A', isActive: true })
      const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
      const { result, rerender } = renderHook(
        ({ scenarios }) => useScenarioEditor(makeDataset({ goalScenarios: scenarios }), makeActions(), 0),
        { initialProps: { scenarios: [plan, other] } },
      )
      rerender({ scenarios: [other] })
      act(() => result.current.patchDraft({ horizonYears: 12 }))
      act(() => result.current.selectScenario(other))
      expect(result.current.unsaved).toBe(false)

      // Deleted in its turn: what is on screen then is the new start, not the first one's.
      rerender({ scenarios: [] })
      expect(result.current.activeId).toBeNull()
      expect(result.current.unsaved).toBe(false)
    })
  })

  describe('hidden lines', () => {
    function setupWithRerender() {
      const plan = makeScenario({ id: 1, name: 'Path A', sortOrder: 0, isActive: true })
      const other = makeScenario({ id: 2, name: 'Path B', sortOrder: 1 })
      const actions = makeActions()
      return {
        plan,
        other,
        ...renderHook(
          ({ scenarios }) => useScenarioEditor(makeDataset({ goalScenarios: scenarios }), actions, 0),
          { initialProps: { scenarios: [plan, other] } },
        ),
      }
    }

    it('forgets a line that was hidden once its scenario is gone', () => {
      const { result, rerender, plan, other } = setupWithRerender()
      act(() => result.current.onToggleVisible(other.id))
      expect(result.current.hiddenIds.has(other.id)).toBe(true)

      rerender({ scenarios: [plan] })

      expect(result.current.hiddenIds.size).toBe(0)
    })

    it('keeps the loaded scenario\'s saved line hidden while it is edited, and forgets that once it is drawn as the editing line again', () => {
      const { result, plan } = setupWithRerender()
      act(() => result.current.patchDraft({ monthlyContributionCents: 77_000 }))
      // While edited, the saved line is drawn beside the editing one, and can be hidden.
      act(() => result.current.onToggleVisible(plan.id))
      expect(result.current.hiddenIds.has(plan.id)).toBe(true)

      act(() => result.current.onDiscard())

      expect(result.current.dirty).toBe(false)
      expect(result.current.hiddenIds.has(plan.id)).toBe(false)
    })

    it('forgets it after a save as well, and when the edits are put back by hand', () => {
      const { result, rerender, plan, other } = setupWithRerender()
      act(() => result.current.patchDraft({ monthlyContributionCents: 77_000 }))
      act(() => result.current.onToggleVisible(plan.id))

      rerender({ scenarios: [{ ...plan, monthlyContributionCents: 77_000 }, other] })
      expect(result.current.dirty).toBe(false)
      expect(result.current.hiddenIds.has(plan.id)).toBe(false)

      act(() => result.current.patchDraft({ monthlyContributionCents: 1 }))
      act(() => result.current.onToggleVisible(plan.id))
      act(() => result.current.patchDraft({ monthlyContributionCents: 77_000 }))
      expect(result.current.hiddenIds.has(plan.id)).toBe(false)
    })

    it('keeps the same set while every hidden line still has its scenario', () => {
      const { result, rerender, plan, other } = setupWithRerender()
      act(() => result.current.onToggleVisible(other.id))
      const hidden = result.current.hiddenIds

      rerender({ scenarios: [plan, { ...other, name: 'Path B, renamed' }] })

      expect(result.current.hiddenIds).toBe(hidden)
    })
  })
})
