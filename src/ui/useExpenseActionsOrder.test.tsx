import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, ExpenseSettings } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { defaultExpenseSettings } from '../engine'
import { makeDataset } from '../testing/factories'
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

describe('useExpenseActions — settings answers that arrive out of order', () => {
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
})
