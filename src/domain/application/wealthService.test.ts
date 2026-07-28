import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import {
  createWealthAccount,
  createWealthCheckin,
  patchWealthAccount,
  patchWealthCheckin,
  removeWealthAccount,
  removeWealthCheckin,
} from './wealthService'

const OWNER = 'owner@example.com'

describe('createWealthAccount', () => {
  it('creates an account with trimmed name', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: '  Broker  ',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    expect(account.name).toBe('Broker')
    expect(account.kind).toBe('investment')
    expect(account.id).toBeGreaterThan(0)
  })

  it('throws for empty name', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      createWealthAccount(repo, OWNER, { name: '   ', kind: 'cash', sortOrder: 0, archived: false }),
    ).rejects.toThrow('Account name is required')
  })
})

describe('patchWealthAccount', () => {
  it('throws for empty patch', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: 'Savings',
      kind: 'cash',
      sortOrder: 0,
      archived: false,
    })
    await expect(patchWealthAccount(repo, OWNER, account.id, {})).rejects.toThrow('Empty patch')
  })

  it('updates kind', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: 'Mixed',
      kind: 'cash',
      sortOrder: 0,
      archived: false,
    })
    const updated = await patchWealthAccount(repo, OWNER, account.id, { kind: 'investment' })
    expect(updated.kind).toBe('investment')
  })
})

describe('removeWealthAccount', () => {
  it('deletes (hard) an unused account', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: 'Empty',
      kind: 'other_asset',
      sortOrder: 0,
      archived: false,
    })
    await removeWealthAccount(repo, OWNER, account.id)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthAccounts.find((a) => a.id === account.id)).toBeUndefined()
  })

  it('soft-deletes (archives) an account with check-in history', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    await createWealthCheckin(repo, OWNER, {
      checkinDate: '2024-06-01',
      entries: [{ accountId: account.id, valueCents: 50_000_000 }],
    })
    await removeWealthAccount(repo, OWNER, account.id)
    const dataset = await repo.loadDataset(OWNER)
    const found = dataset.wealthAccounts.find((a) => a.id === account.id)
    expect(found).toBeDefined()
    expect(found!.archived).toBe(true)
  })
})

describe('createWealthCheckin', () => {
  it('creates a check-in with entries', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    const checkin = await createWealthCheckin(repo, OWNER, {
      checkinDate: '2024-06-01',
      note: 'Mid-year review',
      entries: [{ accountId: account.id, valueCents: 50_000_000 }],
    })
    expect(checkin.checkinDate).toBe('2024-06-01')
    expect(checkin.note).toBe('Mid-year review')
    expect(checkin.entries).toHaveLength(1)
    expect(checkin.entries[0]!.valueCents).toBe(50_000_000)
  })

  it('throws for invalid date format', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      createWealthCheckin(repo, OWNER, { checkinDate: '2024/06/01', entries: [] }),
    ).rejects.toThrow('checkinDate must be YYYY-MM-DD')
  })
})

describe('patchWealthCheckin', () => {
  it('throws for empty patch', async () => {
    const repo = inMemoryExpenseRepository()
    const checkin = await createWealthCheckin(repo, OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })
    await expect(patchWealthCheckin(repo, OWNER, checkin.id, {})).rejects.toThrow('Empty patch')
  })

  it('updates the date', async () => {
    const repo = inMemoryExpenseRepository()
    const checkin = await createWealthCheckin(repo, OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })
    const updated = await patchWealthCheckin(repo, OWNER, checkin.id, {
      checkinDate: '2024-07-01',
    })
    expect(updated.checkinDate).toBe('2024-07-01')
  })
})

describe('removeWealthCheckin', () => {
  it('deletes a check-in', async () => {
    const repo = inMemoryExpenseRepository()
    const checkin = await createWealthCheckin(repo, OWNER, {
      checkinDate: '2024-06-01',
      entries: [],
    })
    await removeWealthCheckin(repo, OWNER, checkin.id)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthCheckins.find((c) => c.id === checkin.id)).toBeUndefined()
  })
})
