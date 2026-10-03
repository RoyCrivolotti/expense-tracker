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
  const addToData = (scenario: GoalScenario) => {
    dataset = makeDataset({ goalScenarios: [...dataset.goalScenarios, scenario] })
    hook.rerender()
  }
  return { ...hook, seen, plan, other, actions, addToData }
}

describe('useScenarioEditor', () => {
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

    it('keeps the same set while every hidden line still has its scenario', () => {
      const { result, rerender, plan, other } = setupWithRerender()
      act(() => result.current.onToggleVisible(other.id))
      const hidden = result.current.hiddenIds

      rerender({ scenarios: [plan, { ...other, name: 'Path B, renamed' }] })

      expect(result.current.hiddenIds).toBe(hidden)
    })
  })
})
