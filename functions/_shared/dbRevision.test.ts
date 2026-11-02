import { describe, expect, it } from 'vitest'
import { bumpRevisionReadingPrevious } from './dbRevision'

/** A database whose batch answers with the given rows for the read and the replacement. */
function batching(read: unknown[], replaced: unknown[]): D1Database {
  const statement = { bind: () => statement }
  return {
    prepare: () => statement,
    batch: async () => [{ results: read }, { results: replaced }],
  } as unknown as D1Database
}

describe('bumpRevisionReadingPrevious', () => {
  it('returns the token it replaced and the one it left', async () => {
    const db = batching([{ token: 'old' }], [{ token: 'new' }])

    await expect(bumpRevisionReadingPrevious(db, 'owner@example.com')).resolves.toEqual({ previous: 'old', token: 'new' })
  })

  it('returns no previous token for an owner who had none', async () => {
    const db = batching([], [{ token: 'new' }])

    await expect(bumpRevisionReadingPrevious(db, 'owner@example.com')).resolves.toEqual({ previous: null, token: 'new' })
  })

  it('does not fail the write when the database sends no row back for the replacement', async () => {
    const db = batching([{ token: 'old' }], [])

    await expect(bumpRevisionReadingPrevious(db, 'owner@example.com')).resolves.toEqual({ previous: 'old', token: null })
  })
})
