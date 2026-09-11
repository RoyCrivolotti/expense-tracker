import { describe, expect, it } from 'vitest'
import { isCompatibleSnapshot } from './offlineCache'

describe('isCompatibleSnapshot', () => {
  it('rejects a snapshot written before versioning existed', () => {
    // The real-world case: a user whose cached dataset predates `flags`, which
    // buildLookup would map over and throw on.
    expect(isCompatibleSnapshot({})).toBe(false)
  })

  it('rejects a snapshot from an older schema version', () => {
    expect(isCompatibleSnapshot({ version: 1 })).toBe(false)
  })

  it('rejects a missing record', () => {
    expect(isCompatibleSnapshot(undefined)).toBe(false)
  })

  it('accepts a snapshot written by this build', () => {
    expect(isCompatibleSnapshot({ version: 2 })).toBe(true)
  })
})
