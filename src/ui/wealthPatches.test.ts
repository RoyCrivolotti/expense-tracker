import { describe, expect, it } from 'vitest'
import { makeDataset } from '../testing/factories'
import type { WealthAccount, WealthCheckin } from '../types'
import {
  patchAfterWealthAccountCreate,
  patchAfterWealthAccountDelete,
  patchAfterWealthAccountUpdate,
  patchAfterWealthCheckinCreate,
  patchAfterWealthCheckinDelete,
  patchAfterWealthCheckinUpdate,
} from './datasetPatches'

function makeAccount(id: number, name = 'Account', archived = false): WealthAccount {
  return { id, name, kind: 'investment', sortOrder: id, archived }
}

function makeCheckin(id: number, date: string): WealthCheckin {
  return { id, checkinDate: date, createdAt: '2024-01-01T00:00:00', entries: [] }
}

describe('patchAfterWealthAccountCreate', () => {
  it('adds account sorted by sortOrder then id', () => {
    const ds = makeDataset({
      wealthAccounts: [makeAccount(2, 'B')],
    })
    const newAcc = makeAccount(1, 'A')
    const result = patchAfterWealthAccountCreate(ds, newAcc)
    expect(result.wealthAccounts.map((a) => a.id)).toEqual([1, 2])
  })

  it('does not mutate the original dataset', () => {
    const ds = makeDataset()
    patchAfterWealthAccountCreate(ds, makeAccount(1))
    expect(ds.wealthAccounts).toHaveLength(0)
  })
})

describe('patchAfterWealthAccountUpdate', () => {
  it('replaces the account by id', () => {
    const ds = makeDataset({ wealthAccounts: [makeAccount(1, 'Old')] })
    const result = patchAfterWealthAccountUpdate(ds, { ...makeAccount(1, 'New'), id: 1 })
    expect(result.wealthAccounts[0]!.name).toBe('New')
  })
})

describe('patchAfterWealthAccountDelete', () => {
  it('removes the account when archived=false (hard delete)', () => {
    const ds = makeDataset({ wealthAccounts: [makeAccount(1), makeAccount(2)] })
    const result = patchAfterWealthAccountDelete(ds, 1, false)
    expect(result.wealthAccounts.map((a) => a.id)).toEqual([2])
  })

  it('marks the account archived when archived=true (soft delete)', () => {
    const ds = makeDataset({ wealthAccounts: [makeAccount(1)] })
    const result = patchAfterWealthAccountDelete(ds, 1, true)
    expect(result.wealthAccounts[0]!.archived).toBe(true)
  })
})

describe('patchAfterWealthCheckinCreate', () => {
  it('prepends the new check-in sorted by date desc', () => {
    const ds = makeDataset({ wealthCheckins: [makeCheckin(1, '2024-01-01')] })
    const result = patchAfterWealthCheckinCreate(ds, makeCheckin(2, '2025-01-01'))
    expect(result.wealthCheckins.map((c) => c.id)).toEqual([2, 1])
  })

  it('does not mutate the original dataset', () => {
    const ds = makeDataset()
    patchAfterWealthCheckinCreate(ds, makeCheckin(1, '2024-01-01'))
    expect(ds.wealthCheckins).toHaveLength(0)
  })
})

describe('patchAfterWealthCheckinUpdate', () => {
  it('replaces the check-in by id', () => {
    const ds = makeDataset({ wealthCheckins: [makeCheckin(1, '2024-01-01')] })
    const updated = { ...makeCheckin(1, '2024-06-01'), id: 1 }
    const result = patchAfterWealthCheckinUpdate(ds, updated)
    expect(result.wealthCheckins[0]!.checkinDate).toBe('2024-06-01')
  })
})

describe('patchAfterWealthCheckinDelete', () => {
  it('removes the check-in by id', () => {
    const ds = makeDataset({
      wealthCheckins: [makeCheckin(1, '2024-01-01'), makeCheckin(2, '2024-06-01')],
    })
    const result = patchAfterWealthCheckinDelete(ds, 1)
    expect(result.wealthCheckins.map((c) => c.id)).toEqual([2])
  })
})
