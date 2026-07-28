import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from './inMemoryExpenseRepository'

const OWNER = 'owner@example.com'

describe('inMemoryExpenseRepository — wealth accounts', () => {
  it('creates and loads a wealth account', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    expect(account.id).toBeGreaterThan(0)
    expect(account.name).toBe('Broker')
    expect(account.kind).toBe('investment')

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthAccounts).toHaveLength(1)
  })

  it('throws on empty name', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      repo.createWealthAccount(OWNER, { name: '', kind: 'cash', sortOrder: 0, archived: false }),
    ).rejects.toMatchObject({ message: 'Account name is required' })
  })

  it('updates a wealth account', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Savings',
      kind: 'cash',
      sortOrder: 0,
      archived: false,
    })
    const updated = await repo.updateWealthAccount(OWNER, account.id, { sortOrder: 5 })
    expect(updated.sortOrder).toBe(5)
  })

  it('throws 404 when updating non-existent account', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      repo.updateWealthAccount(OWNER, 999, { archived: true }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws on empty patch', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Empty',
      kind: 'other_asset',
      sortOrder: 0,
      archived: false,
    })
    await expect(repo.updateWealthAccount(OWNER, account.id, {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it('hard-deletes an unused account', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Unused',
      kind: 'debt',
      sortOrder: 0,
      archived: false,
    })
    await repo.deleteWealthAccount(OWNER, account.id)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthAccounts).toHaveLength(0)
  })

  it('soft-deletes (archives) an account with check-in entries', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-06-01',
      entries: [{ accountId: account.id, valueCents: 10_000_000 }],
    })
    await repo.deleteWealthAccount(OWNER, account.id)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthAccounts[0]!.archived).toBe(true)
  })

  it('throws 404 when deleting non-existent account', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(repo.deleteWealthAccount(OWNER, 999)).rejects.toMatchObject({ status: 404 })
  })
})

describe('inMemoryExpenseRepository — wealth checkins', () => {
  it('creates a check-in with entries', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-06-01',
      note: 'Q2',
      entries: [{ accountId: account.id, valueCents: 50_000_000 }],
    })
    expect(checkin.checkinDate).toBe('2024-06-01')
    expect(checkin.note).toBe('Q2')
    expect(checkin.entries[0]!.valueCents).toBe(50_000_000)
  })

  it('throws for invalid date', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      repo.createWealthCheckin(OWNER, { checkinDate: 'not-a-date', entries: [] }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('updates a check-in date and entries', async () => {
    const repo = inMemoryExpenseRepository()
    const account = await repo.createWealthAccount(OWNER, {
      name: 'Broker',
      kind: 'investment',
      sortOrder: 0,
      archived: false,
    })
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-06-01',
      entries: [{ accountId: account.id, valueCents: 10_000_000 }],
    })
    const updated = await repo.updateWealthCheckin(OWNER, checkin.id, {
      checkinDate: '2024-07-01',
      entries: [{ accountId: account.id, valueCents: 20_000_000 }],
    })
    expect(updated.checkinDate).toBe('2024-07-01')
    expect(updated.entries[0]!.valueCents).toBe(20_000_000)
  })

  it('throws 404 when updating non-existent checkin', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(
      repo.updateWealthCheckin(OWNER, 999, { checkinDate: '2024-01-01' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws on empty patch', async () => {
    const repo = inMemoryExpenseRepository()
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-01-01',
      entries: [],
    })
    await expect(repo.updateWealthCheckin(OWNER, checkin.id, {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it('deletes a check-in', async () => {
    const repo = inMemoryExpenseRepository()
    const checkin = await repo.createWealthCheckin(OWNER, {
      checkinDate: '2024-01-01',
      entries: [],
    })
    await repo.deleteWealthCheckin(OWNER, checkin.id)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthCheckins).toHaveLength(0)
  })

  it('throws 404 when deleting non-existent checkin', async () => {
    const repo = inMemoryExpenseRepository()
    await expect(repo.deleteWealthCheckin(OWNER, 999)).rejects.toMatchObject({ status: 404 })
  })

  it('loads check-ins from seed', async () => {
    const repo = inMemoryExpenseRepository({
      wealthCheckins: [
        {
          id: 1,
          checkinDate: '2024-01-01',
          createdAt: '2024-01-01T00:00:00',
          entries: [{ accountId: 5, valueCents: 100_000 }],
        },
      ],
    })
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.wealthCheckins).toHaveLength(1)
    expect(dataset.wealthCheckins[0]!.entries).toHaveLength(1)
  })
})
