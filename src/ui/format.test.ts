import { describe, expect, it } from 'vitest'
import { makeAttachment, makeDataset, makeFlag } from '../testing/factories'
import { buildLookup } from './format'

describe('buildLookup — flags', () => {
  it('finds a flag by id', () => {
    const flag = makeFlag({ id: 3, name: 'Work travel' })
    const lookup = buildLookup(makeDataset({ flags: [flag] }))

    expect(lookup.flag(3)).toEqual(flag)
  })

  it('returns undefined for a flag that is not in the dataset', () => {
    // The row renderer calls this for every transaction, including ones whose
    // flag was deleted in another tab — it must not throw.
    const lookup = buildLookup(makeDataset({ flags: [makeFlag({ id: 1 })] }))

    expect(lookup.flag(99)).toBeUndefined()
  })

  it('returns undefined when the owner has no flags at all', () => {
    expect(buildLookup(makeDataset()).flag(1)).toBeUndefined()
  })
})

describe('buildLookup — attachments', () => {
  it('groups receipts by transaction', () => {
    const dataset = makeDataset({
      attachments: [
        makeAttachment({ id: 1, transactionId: 10 }),
        makeAttachment({ id: 2, transactionId: 10 }),
        makeAttachment({ id: 3, transactionId: 11 }),
      ],
    })

    expect(buildLookup(dataset).attachments(10).map((a) => a.id)).toEqual([1, 2])
  })

  it('is empty for a transaction with none', () => {
    expect(buildLookup(makeDataset()).attachments(10)).toEqual([])
  })

  it('returns the same empty result for an unknown transaction', () => {
    const dataset = makeDataset({ attachments: [makeAttachment({ id: 1, transactionId: 10 })] })

    expect(buildLookup(dataset).attachments(999)).toEqual([])
  })
})
