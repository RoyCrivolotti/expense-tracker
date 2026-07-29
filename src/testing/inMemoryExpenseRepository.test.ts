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
