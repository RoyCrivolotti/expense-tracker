import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, ExpenseSettings, GoalScenario } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { defaultExpenseSettings } from '../engine'
import { makeDataset, makeScenario } from '../testing/factories'
import { useExpenseActions } from './useExpenseActions'

/** A write whose answer is held until the test lets it land. */
function held<T>() {
  let land!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    land = resolve
  })
  return { promise, land }
}

function harness(source: Partial<ExpenseDataSource>, initial: Partial<ExpenseDataset> = {}) {
  let dataset: ExpenseDataset = { ...makeDataset(), ...initial }
  const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
    dataset = patch(dataset)
  })
  const { result } = renderHook(() =>
    useExpenseActions({ canWrite: true, load: vi.fn(), ...source }, applyPatch, vi.fn()),
  )
  return { actions: result.current!, read: () => dataset }
}

describe('useExpenseActions — answers that arrive out of order', () => {
  const settings = defaultExpenseSettings()

  it('keeps the stars when the answer to an earlier write to another setting lands after theirs', async () => {
    const inflation = held<ExpenseSettings>()
    const updateSettings = vi
      .fn()
      .mockReturnValueOnce(inflation.promise)
      .mockResolvedValueOnce({ ...settings, assumedInflation: 0.02, goalLevers: ['horizonYears'] })
    const { actions, read } = harness({ updateSettings }, { settings })

    let slow!: Promise<void>
    await act(async () => {
      slow = actions.updateSettings({ assumedInflation: 0.03 })
      await actions.updateSettings({ goalLevers: ['horizonYears'] })
    })
    expect(read().settings.goalLevers).toEqual(['horizonYears'])
    await act(async () => {
      // The server handled the inflation write first, so its row still has the old stars.
      inflation.land({ ...settings, assumedInflation: 0.03 })
      await slow
    })

    expect(read().settings.goalLevers).toEqual(['horizonYears'])
    expect(read().settings.assumedInflation).toBe(0.03)
  })

  it('keeps the newest value of a setting when two writes to it answer in the wrong order', async () => {
    const first = held<ExpenseSettings>()
    const updateSettings = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...settings, assumedInflation: 0.04 })
    const { actions, read } = harness({ updateSettings }, { settings })

    let slow!: Promise<void>
    await act(async () => {
      slow = actions.updateSettings({ assumedInflation: 0.03 })
      await actions.updateSettings({ assumedInflation: 0.04 })
      first.land({ ...settings, assumedInflation: 0.03 })
      await slow
    })

    expect(read().settings.assumedInflation).toBe(0.04)
  })

  it('keeps the plan when a slow Save answers after Use as my plan', async () => {
    const one = makeScenario({ id: 1, sortOrder: 0, isActive: true })
    const two = makeScenario({ id: 2, sortOrder: 1, name: 'Path B' })
    const save = held<GoalScenario>()
    const { actions, read } = harness(
      {
        updateScenario: vi.fn().mockReturnValue(save.promise),
        activateScenario: vi.fn().mockResolvedValue({ ...two, isActive: true }),
      },
      { goalScenarios: [one, two] },
    )

    let slow!: Promise<void>
    await act(async () => {
      slow = actions.updateScenario(2, { name: 'Path B2' })
      await actions.activateScenario(2)
      // The save was handled before the activation, so its row is not the plan.
      save.land({ ...two, name: 'Path B2' })
      await slow
    })

    expect(read().goalScenarios.map((s) => [s.id, s.isActive])).toEqual([
      [1, false],
      [2, true],
    ])
    expect(read().goalScenarios[1]?.name).toBe('Path B2')
  })

  it('keeps a saved edit when a slow Use as my plan answers after the Save', async () => {
    const one = makeScenario({ id: 1, sortOrder: 0, isActive: true })
    const two = makeScenario({ id: 2, sortOrder: 1, name: 'Path B' })
    const activate = held<GoalScenario>()
    const { actions, read } = harness(
      {
        activateScenario: vi.fn().mockReturnValue(activate.promise),
        updateScenario: vi.fn().mockResolvedValue({ ...two, name: 'Path B2', isActive: true }),
      },
      { goalScenarios: [one, two] },
    )

    let slow!: Promise<void>
    await act(async () => {
      slow = actions.activateScenario(2)
      await actions.updateScenario(2, { name: 'Path B2' })
      activate.land({ ...two, isActive: true })
      await slow
    })

    expect(read().goalScenarios[1]).toMatchObject({ name: 'Path B2', isActive: true })
    expect(read().goalScenarios[0]?.isActive).toBe(false)
  })
})
