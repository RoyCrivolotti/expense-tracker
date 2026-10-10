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

describe('the balances of a check-in', () => {
  async function withAccount() {
    const repo = inMemoryExpenseRepository()
    const account = await createWealthAccount(repo, OWNER, { name: 'Broker', kind: 'investment', sortOrder: 0, archived: false })
    const checkin = (entries: unknown) =>
      ({ checkinDate: '2026-06-01', entries }) as unknown as Parameters<typeof createWealthCheckin>[2]
    const entry = (valueCents: unknown) => [{ accountId: account.id, valueCents }]
    return { repo, checkin, entry }
  }

  it('saves a balance, so the refusals below are about the balance and not the account', async () => {
    const { repo, checkin, entry } = await withAccount()
    await expect(createWealthCheckin(repo, OWNER, checkin(entry(5_000_00)))).resolves.toBeDefined()
  })

  it.each([
    ['a balance that is text', '5000'],
    ['a balance with cents in the cents', 10.5],
    ['a balance that is not finite', Number.POSITIVE_INFINITY],
    ['a balance beyond any account', 1e14],
    ['a debt past any account', -1e14],
  ])('refuses %s, which would be stored and then summed into a net worth', async (_name, value) => {
    const { repo, checkin, entry } = await withAccount()
    await expect(createWealthCheckin(repo, OWNER, checkin(entry(value)))).rejects.toThrow(/valueCents/)
  })

  it.each([
    ['an entry that is null', [null]],
    ['entries that are not a list', 'abc'],
  ])('refuses %s', async (_name, entries) => {
    const { repo, checkin } = await withAccount()
    await expect(createWealthCheckin(repo, OWNER, checkin(entries))).rejects.toThrow(/entries/)
  })

  it('takes a negative balance, which an overdrawn account really has', async () => {
    const { repo, checkin, entry } = await withAccount()
    await expect(createWealthCheckin(repo, OWNER, checkin(entry(-250_000)))).resolves.toBeDefined()
  })

  it('checks the balances of an edit as well', async () => {
    const { repo, checkin, entry } = await withAccount()
    const saved = await createWealthCheckin(repo, OWNER, checkin(entry(5_000_00)))
    await expect(patchWealthCheckin(repo, OWNER, saved.id, { entries: entry(1e14) as never })).rejects.toThrow(/valueCents/)
  })
})
