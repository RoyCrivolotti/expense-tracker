import { describe, expect, it } from 'vitest'
import { makeDataset, makeFlag } from '../testing/factories'
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
