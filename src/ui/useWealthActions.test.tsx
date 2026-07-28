import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseDataset, WealthAccount, WealthCheckin } from '../types'
import type { ExpenseDataSource, NewWealthAccount, NewWealthCheckin } from '../data/dataSource'
import { makeDataset } from '../testing/factories'
import { useExpenseActions } from './useExpenseActions'

const baseDataset = makeDataset()

function makeAccount(id: number): WealthAccount {
  return { id, name: 'Broker', kind: 'investment', sortOrder: 0, archived: false }
}

function makeCheckin(id: number): WealthCheckin {
  return { id, checkinDate: '2024-06-01', createdAt: '2024-06-01T00:00:00', entries: [] }
}

describe('useExpenseActions — wealth accounts', () => {
  it('createWealthAccount calls source and patches dataset', async () => {
    const createWealthAccount = vi.fn().mockResolvedValue(makeAccount(1))
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createWealthAccount,
    }
    let dataset: ExpenseDataset = baseDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    const input: NewWealthAccount = { name: 'Broker', kind: 'investment', sortOrder: 0, archived: false }
    await act(async () => {
      await result.current!.createWealthAccount(input)
    })

    expect(createWealthAccount).toHaveBeenCalledWith(input)
    expect(dataset.wealthAccounts).toHaveLength(1)
  })

  it('updateWealthAccount calls source and patches dataset', async () => {
    const updateWealthAccount = vi.fn().mockResolvedValue(makeAccount(1))
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      updateWealthAccount,
    }
    let dataset: ExpenseDataset = makeDataset({ wealthAccounts: [makeAccount(1)] })
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    await act(async () => {
      await result.current!.updateWealthAccount(1, { sortOrder: 5 })
    })

    expect(updateWealthAccount).toHaveBeenCalledWith(1, { sortOrder: 5 })
  })

  it('deleteWealthAccount calls source and patches dataset', async () => {
    const deleteWealthAccount = vi.fn().mockResolvedValue(undefined)
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      deleteWealthAccount,
    }
    let dataset: ExpenseDataset = makeDataset({ wealthAccounts: [makeAccount(1)] })
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    await act(async () => {
      await result.current!.deleteWealthAccount(1)
    })

    expect(deleteWealthAccount).toHaveBeenCalledWith(1)
    expect(dataset.wealthAccounts[0]!.archived).toBe(true)
  })
})

describe('useExpenseActions — wealth checkins', () => {
  it('createWealthCheckin calls source and patches dataset', async () => {
    const createWealthCheckin = vi.fn().mockResolvedValue(makeCheckin(1))
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      createWealthCheckin,
    }
    let dataset: ExpenseDataset = baseDataset
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    const input: NewWealthCheckin = { checkinDate: '2024-06-01', entries: [] }
    await act(async () => {
      await result.current!.createWealthCheckin(input)
    })

    expect(createWealthCheckin).toHaveBeenCalledWith(input)
    expect(dataset.wealthCheckins).toHaveLength(1)
  })

  it('updateWealthCheckin calls source and patches dataset', async () => {
    const updateWealthCheckin = vi.fn().mockResolvedValue(makeCheckin(1))
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      updateWealthCheckin,
    }
    let dataset: ExpenseDataset = makeDataset({ wealthCheckins: [makeCheckin(1)] })
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    await act(async () => {
      await result.current!.updateWealthCheckin(1, { checkinDate: '2024-07-01' })
    })

    expect(updateWealthCheckin).toHaveBeenCalledWith(1, { checkinDate: '2024-07-01' })
  })

  it('deleteWealthCheckin calls source and patches dataset', async () => {
    const deleteWealthCheckin = vi.fn().mockResolvedValue(undefined)
    const source: ExpenseDataSource = {
      canWrite: true,
      load: vi.fn(),
      deleteWealthCheckin,
    }
    let dataset: ExpenseDataset = makeDataset({ wealthCheckins: [makeCheckin(1)] })
    const applyPatch = vi.fn((patch: (d: ExpenseDataset) => ExpenseDataset) => {
      dataset = patch(dataset)
    })
    const { result } = renderHook(() => useExpenseActions(source, applyPatch, vi.fn()))

    await act(async () => {
      await result.current!.deleteWealthCheckin(1)
    })

    expect(deleteWealthCheckin).toHaveBeenCalledWith(1)
    expect(dataset.wealthCheckins).toHaveLength(0)
  })
})
