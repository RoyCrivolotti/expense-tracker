import { describe, expect, it } from 'vitest'
import { inMemoryExpenseRepository } from './inMemoryExpenseRepository'
import { RepoHttpError } from './repoHttpError'
import { defaultMilestones } from '../domain/engine/milestones'

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
