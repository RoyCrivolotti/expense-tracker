import { describe, expect, it } from 'vitest'
import {
  toWealthAccount,
  toWealthCheckin,
  toWealthCheckinEntry,
  type WealthAccountRow,
  type WealthCheckinEntryRow,
  type WealthCheckinRow,
} from './rows'

describe('toWealthAccount', () => {
  it('maps all fields', () => {
    const row: WealthAccountRow = {
      id: 1,
      name: 'Broker',
      kind: 'investment',
      sort_order: 2,
      archived: 0,
    }
    expect(toWealthAccount(row)).toEqual({
      id: 1,
      name: 'Broker',
      kind: 'investment',
      sortOrder: 2,
      archived: false,
    })
  })

  it('converts archived 1 to true', () => {
    const row: WealthAccountRow = {
      id: 2,
      name: 'Archived',
      kind: 'cash',
      sort_order: 0,
      archived: 1,
    }
    expect(toWealthAccount(row).archived).toBe(true)
  })
})

describe('toWealthCheckinEntry', () => {
  it('maps all fields', () => {
    const row: WealthCheckinEntryRow = { account_id: 3, value_cents: 50_000 }
    expect(toWealthCheckinEntry(row)).toEqual({ accountId: 3, valueCents: 50_000 })
  })
})

describe('toWealthCheckin', () => {
  it('maps all fields and attaches entries', () => {
    const row: WealthCheckinRow = {
      id: 5,
      checkin_date: '2024-06-01',
      note: 'Mid-year',
      created_at: '2024-06-01T10:00:00',
    }
    const result = toWealthCheckin(row, [{ accountId: 1, valueCents: 1000 }])
    expect(result).toEqual({
      id: 5,
      checkinDate: '2024-06-01',
      note: 'Mid-year',
      createdAt: '2024-06-01T10:00:00',
      entries: [{ accountId: 1, valueCents: 1000 }],
    })
  })

  it('omits note when null', () => {
    const row: WealthCheckinRow = {
      id: 1,
      checkin_date: '2024-01-01',
      note: null,
      created_at: '2024-01-01T00:00:00',
    }
    const result = toWealthCheckin(row, [])
    expect('note' in result).toBe(false)
  })
})
