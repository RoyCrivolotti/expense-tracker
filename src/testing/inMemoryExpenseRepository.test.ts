import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from './inMemoryExpenseRepository'
import { RepoHttpError } from './repoHttpError'
import { defaultMilestones } from '../domain/engine/milestones'
import { makeFlag, makeLabel, makeTransaction } from './factories'

const OWNER = 'owner@example.com'

describe('inMemoryExpenseRepository settings milestones', () => {
  it('starts from the built-in ladder', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.settings.milestones).toEqual(defaultMilestones())
  })

  it('normalizes a stored list to ascending order with trimmed labels', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const settings = await repo.updateSettings(OWNER, {
      milestones: [
        { amountCents: 20_000_000, label: 'Second' },
        { amountCents: 10_000_000, label: '  First  ' },
      ],
    })
    expect(settings.milestones).toEqual([
      { amountCents: 10_000_000, label: 'First' },
      { amountCents: 20_000_000, label: 'Second' },
    ])
  })

  // The in-memory repo validates synchronously, before returning its promise.
  it('rejects a non-positive milestone amount', () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    expect(() =>
      repo.updateSettings(OWNER, { milestones: [{ amountCents: 0, label: '' }] }),
    ).toThrow(RepoHttpError)
  })

  it('rejects a milestone list that is not an array', () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    expect(() => repo.updateSettings(OWNER, { milestones: 'nope' as unknown as [] })).toThrow(
      /must be an array/,
    )
  })

  it('accepts a deliberately empty list', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    const settings = await repo.updateSettings(OWNER, { milestones: [] })
    expect(settings.milestones).toEqual([])
  })
})

describe('inMemoryExpenseRepository settings assumedInflation', () => {
  it('starts at 2% and keeps a value it is given', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    expect((await repo.loadDataset(OWNER)).settings.assumedInflation).toBe(0.02)
    expect((await repo.updateSettings(OWNER, { assumedInflation: 0.035 })).assumedInflation).toBe(0.035)
  })

  // The double must refuse what the API refuses, or a test would pass on a value D1 rejects.
  it('refuses a value outside zero to ten percent, and one that is not a number', () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    for (const bad of [-0.01, 0.11, NaN, '0.02' as unknown as number]) {
      expect(() => repo.updateSettings(OWNER, { assumedInflation: bad })).toThrow(RepoHttpError)
    }
  })
})

describe('inMemoryExpenseRepository settings goalLevers', () => {
  it('starts at the five defaults and keeps a list it is given', async () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    expect((await repo.loadDataset(OWNER)).settings.goalLevers).toHaveLength(5)
    const saved = await repo.updateSettings(OWNER, { goalLevers: ['rentMonthlyCents'] })
    expect(saved.goalLevers).toEqual(['rentMonthlyCents'])
  })

  // The double must refuse what the API refuses, or a test would pass on a list D1 rejects.
  it('refuses a list the API refuses', () => {
    const repo = inMemoryExpenseRepository({}, OWNER)
    for (const bad of [['planStartDate'], ['horizonYears', 'horizonYears'], 'horizonYears'] as unknown as [][]) {
      expect(() => repo.updateSettings(OWNER, { goalLevers: bad })).toThrow(RepoHttpError)
    }
  })
})

/**
 * Mirrors dbFlags.test.ts/dbWrite.test.ts's coverage of the D1 adapter, but against
 * the double the rest of the application layer actually runs its own tests
 * against — see the architecture doc's warning that divergence here means a test
 * suite passing while production breaks.
 */
describe('inMemoryExpenseRepository flag auto-label', () => {
  it('retroactively labels every transaction already carrying the flag', async () => {
    const flag = makeFlag({ id: 1 })
    const label = makeLabel({ id: 2 })
    const carrying = makeTransaction({ id: 10, flagId: 1 })
    const notCarrying = makeTransaction({ id: 11 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label], transactions: [carrying, notCarrying] }, OWNER)

    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 10)?.labelIds).toEqual([2])
    expect(dataset.transactions.find((t) => t.id === 11)?.labelIds).toEqual([])
  })

  it('does not duplicate a label the transaction already carries some other way', async () => {
    const flag = makeFlag({ id: 1 })
    const label = makeLabel({ id: 2 })
    // `labelIds` on a seeded Transaction is informational only (emptyStore
    // strips it) — the real pre-existing link has to go through the seed's
    // dedicated transactionLabels field, or this test would start the
    // transaction with no labels at all and never reach the dedup branch.
    const carrying = makeTransaction({ id: 10, flagId: 1 })
    const repo = inMemoryExpenseRepository(
      {
        flags: [flag],
        labels: [label],
        transactions: [carrying],
        transactionLabels: [{ transactionId: 10, labelId: 2 }],
      },
      OWNER,
    )

    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 10)?.labelIds).toEqual([2])
  })

  // Mirrors the settings tests above: this double validates synchronously,
  // before returning a promise, so the throw happens on the call itself.
  it('rejects an auto-label id the owner does not have', () => {
    const flag = makeFlag({ id: 1 })
    const repo = inMemoryExpenseRepository({ flags: [flag] }, OWNER)

    expect(() => repo.updateFlag(OWNER, 1, { autoLabelId: 99 })).toThrow('Invalid labelId')
  })

  const account = { id: 1, name: 'Cash', kind: 'debit' as const, settlement: 'immediate' as const, active: true }
  const category = { id: 1, name: 'Misc', monthlyBudgetCents: 0, sortOrder: 0, active: true }

  it('applies the auto-label going forward when insertTransaction assigns the flag', async () => {
    const flag = makeFlag({ id: 1, autoLabelId: 2 })
    const label = makeLabel({ id: 2 })
    const repo = inMemoryExpenseRepository(
      { flags: [flag], labels: [label], accounts: [account], categories: [category] },
      OWNER,
    )

    const created = await repo.insertTransaction(OWNER, {
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Coffee',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 350,
      cancelled: false,
      flagId: 1,
    })

    expect(created.labelIds).toEqual([2])
  })

  it('applies the auto-label going forward when updateTransaction assigns the flag', async () => {
    const flag = makeFlag({ id: 1, autoLabelId: 2 })
    const label = makeLabel({ id: 2 })
    const existing = makeTransaction({ id: 10 })
    const repo = inMemoryExpenseRepository(
      { flags: [flag], labels: [label], transactions: [existing] },
      OWNER,
    )

    const updated = await repo.updateTransaction(OWNER, 10, { flagId: 1 })

    expect(updated.labelIds).toEqual([2])
  })

  it('applies the auto-label going forward when bulkUpdateTransactions assigns the flag', async () => {
    const flag = makeFlag({ id: 1, autoLabelId: 2 })
    const label = makeLabel({ id: 2 })
    const a = makeTransaction({ id: 10 })
    const b = makeTransaction({ id: 11 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label], transactions: [a, b] }, OWNER)

    const updated = await repo.bulkUpdateTransactions(OWNER, [10, 11], { flagId: 1 })

    expect(updated.map((t) => t.labelIds)).toEqual([[2], [2]])
  })

  it('does not fan out for a flag with no auto-label configured', async () => {
    const flag = makeFlag({ id: 1 })
    const repo = inMemoryExpenseRepository(
      { flags: [flag], accounts: [account], categories: [category] },
      OWNER,
    )

    const created = await repo.insertTransaction(OWNER, {
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Coffee',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 350,
      cancelled: false,
      flagId: 1,
    })

    expect(created.labelIds).toEqual([])
  })

  it('clears a flag’s dangling auto-label when that label is deleted', async () => {
    const flag = makeFlag({ id: 1, autoLabelId: 2 })
    const label = makeLabel({ id: 2 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label] }, OWNER)

    await repo.deleteLabel(OWNER, 2)

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.flags.find((f) => f.id === 1)?.autoLabelId).toBeUndefined()
  })

  it('setting the same auto-label twice is a harmless no-op re-run', async () => {
    const flag = makeFlag({ id: 1 })
    const label = makeLabel({ id: 2 })
    const carrying = makeTransaction({ id: 10, flagId: 1 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label], transactions: [carrying] }, OWNER)

    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })
    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 10)?.labelIds).toEqual([2])
  })

  it('archiving a flag or its auto-label does not strip labels already applied', async () => {
    const flag = makeFlag({ id: 1 })
    const label = makeLabel({ id: 2 })
    const carrying = makeTransaction({ id: 10, flagId: 1 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label], transactions: [carrying] }, OWNER)
    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })

    await repo.updateFlag(OWNER, 1, { active: false })
    await repo.updateLabel(OWNER, 2, { active: false })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 10)?.labelIds).toEqual([2])
  })

  /**
   * An archived label is not excluded from auto-label fan-out, by design — it
   * keeps receiving new fan-out the same way it keeps the chips it already has
   * elsewhere in the app. assertOwnedLabel and the fan-out itself never check
   * `active`, so a flag can point at an already-archived label from the start.
   */
  it('still retroactively applies an auto-label that is already archived', async () => {
    const flag = makeFlag({ id: 1 })
    const label = makeLabel({ id: 2, active: false })
    const carrying = makeTransaction({ id: 10, flagId: 1 })
    const repo = inMemoryExpenseRepository({ flags: [flag], labels: [label], transactions: [carrying] }, OWNER)

    await repo.updateFlag(OWNER, 1, { autoLabelId: 2 })

    const dataset = await repo.loadDataset(OWNER)
    expect(dataset.transactions.find((t) => t.id === 10)?.labelIds).toEqual([2])
  })

  it('still applies an already-archived auto-label going forward when a transaction is flagged', async () => {
    const flag = makeFlag({ id: 1, autoLabelId: 2 })
    const label = makeLabel({ id: 2, active: false })
    const existing = makeTransaction({ id: 10 })
    const repo = inMemoryExpenseRepository(
      { flags: [flag], labels: [label], transactions: [existing] },
      OWNER,
    )

    const updated = await repo.updateTransaction(OWNER, 10, { flagId: 1 })

    expect(updated.labelIds).toEqual([2])
  })
})

/**
 * Mirrors wealthRepository.test.ts's "does not leak another owner account
 * across the tenancy boundary" — the existing auto-label and setTransactionLabels
 * ownership tests above only ever reject a nonexistent id, never a label that
 * genuinely belongs to a different, real owner.
 */
describe('inMemoryExpenseRepository labels — tenancy boundary', () => {
  it('rejects another owner’s real label as an auto-label', async () => {
    const flag = makeFlag({ id: 1 })
    const repo = inMemoryExpenseRepository({ flags: [flag] }, OWNER)
    const theirLabel = await repo.createLabel('other@example.com', {
      name: 'Their trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })

    expect(() => repo.updateFlag(OWNER, 1, { autoLabelId: theirLabel.id })).toThrow('Invalid labelId')
  })

  it('rejects another owner’s real label when setting transaction labels', async () => {
    const mine = makeTransaction({ id: 10 })
    const repo = inMemoryExpenseRepository({ transactions: [mine] }, OWNER)
    const theirLabel = await repo.createLabel('other@example.com', {
      name: 'Their trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })

    expect(() => repo.setTransactionLabels(OWNER, 10, [theirLabel.id])).toThrow('Invalid labelId')
  })
})
