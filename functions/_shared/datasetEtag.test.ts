// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATASET_FORMAT, datasetEtag, ifNoneMatchMatches } from './datasetEtag'
import { onRequestGet } from '../api/expenses/index'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, pinClock } from './testing/expenseWorld'
import { seedLedger } from './testing/seedLedger'

describe('datasetEtag', () => {
  it('is weak and carries the token, the budget month and the format', () => {
    expect(datasetEtag('0a1b2c3d4e5f6071', '2026-10')).toBe(`W/"0a1b2c3d4e5f6071-2026-10-${DATASET_FORMAT}"`)
  })
})

describe('ifNoneMatchMatches', () => {
  const etag = datasetEtag('0a1b2c3d4e5f6071', '2026-10')

  it('matches the tag a browser sends back, weak prefix and all', () => {
    expect(ifNoneMatchMatches(etag, etag)).toBe(true)
  })

  it('matches by weak comparison, so a proxy that dropped the prefix still matches', () => {
    expect(ifNoneMatchMatches(etag.slice(2), etag)).toBe(true)
  })

  it('matches one tag among several', () => {
    expect(ifNoneMatchMatches(`W/"other", ${etag} , "third"`, etag)).toBe(true)
  })

  it('does not match another token, month or format', () => {
    expect(ifNoneMatchMatches(datasetEtag('ffffffffffffffff', '2026-10'), etag)).toBe(false)
    expect(ifNoneMatchMatches(datasetEtag('0a1b2c3d4e5f6071', '2026-11'), etag)).toBe(false)
    expect(ifNoneMatchMatches(etag.replace(/-\d+"$/, '-0"'), etag)).toBe(false)
  })

  it('does not match when the header is missing or empty', () => {
    expect(ifNoneMatchMatches(null, etag)).toBe(false)
    expect(ifNoneMatchMatches('', etag)).toBe(false)
  })

  it('does not treat a wildcard as a match, so the answer is always a full body', () => {
    expect(ifNoneMatchMatches('*', etag)).toBe(false)
  })
})

/** Every path through the JSON with the types seen there, so a renamed, added or dropped field shows. */
function shapeOf(value: unknown, path = '$', out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    out.add(`${path}[]`)
    for (const item of value) shapeOf(item, `${path}[]`, out)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) shapeOf(item, `${path}.${key}`, out)
  } else {
    out.add(`${path}:${value === null ? 'null' : typeof value}`)
  }
  return out
}

describe('the shape of the dataset', () => {
  beforeEach(() => pinClock('2026-10-15'))
  afterEach(() => vi.useRealTimers())

  // A browser that cached the old shape under a tag that still matches would keep using it after a
  // deploy. Changing the shape means moving DATASET_FORMAT, which changes every tag, and then this.
  it('matches the one DATASET_FORMAT was last moved for', async () => {
    const sqlite = migratedDatabase()
    const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
    await seedLedger(world)
    const response = await world.call(onRequestGet, { email: OWNER })
    const paths = [...shapeOf(await response.json())].sort()

    const fingerprint = createHash('sha256').update(paths.join('\n')).digest('hex').slice(0, 16)

    expect(
      { format: DATASET_FORMAT, fingerprint },
      'The JSON shape of GET /api/expenses changed. Raise DATASET_FORMAT in datasetEtag.ts, then put the new fingerprint here.',
    ).toEqual({ format: 1, fingerprint: '6d288a653c77d8b6' })
  })
})
