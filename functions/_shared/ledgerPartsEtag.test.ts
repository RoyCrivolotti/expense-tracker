// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARTS_FORMAT, ifNoneMatchMatches, partEtag } from './datasetEtag'
import { onRequestGet as getCube } from '../api/expenses/cube'
import { onRequestGet as getReference } from '../api/expenses/reference'
import { onRequestGet as getMonths } from '../api/expenses/transactions/months'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, pinClock } from './testing/expenseWorld'
import { seedLedger } from './testing/seedLedger'

const revision = { token: 'a'.repeat(16), budgetMonth: '2026-10' }

describe('partEtag', () => {
  it('is weak and carries the token, the budget month, the part and the format', () => {
    expect(partEtag('reference', revision)).toBe(`W/"${revision.token}-2026-10-reference${PARTS_FORMAT}"`)
  })

  it('carries the range asked for', () => {
    expect(partEtag('months', revision, '2026-01..2026-03')).toBe(`W/"${revision.token}-2026-10-months${PARTS_FORMAT}-2026-01..2026-03"`)
  })

  it('does not match another part, range, token, month or format', () => {
    const tag = partEtag('months', revision, '2026-01..2026-03')
    const matches = (other: string) => ifNoneMatchMatches(other, tag)
    expect(matches(tag)).toBe(true)
    expect(matches(partEtag('cube', revision, '2026-01..2026-03'))).toBe(false)
    expect(matches(partEtag('months', revision, '2026-01..2026-04'))).toBe(false)
    expect(matches(partEtag('months', { ...revision, token: 'ffffffffffffffff' }, '2026-01..2026-03'))).toBe(false)
    expect(matches(partEtag('months', { ...revision, budgetMonth: '2026-11' }, '2026-01..2026-03'))).toBe(false)
    expect(matches(tag.replace(`months${PARTS_FORMAT}`, 'months0'))).toBe(false)
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

describe('the shape of the ledger parts', () => {
  beforeEach(() => pinClock('2026-10-15'))
  afterEach(() => vi.useRealTimers())

  // A browser that cached an old shape under a tag that still matches would keep using it after a
  // deploy. Changing a shape means moving PARTS_FORMAT, which changes every part's tag, and then this.
  it('matches the one PARTS_FORMAT was last moved for', async () => {
    const sqlite = migratedDatabase()
    const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
    await seedLedger(world)
    const paths: string[] = []
    for (const [handler, path] of [
      [getReference, '/reference'],
      [getMonths, '/transactions/months?from=2026-01&to=2026-12'],
      [getCube, '/cube?from=2026-01&to=2026-12'],
    ] as const) {
      const response = await world.call(handler, { email: OWNER, path })
      paths.push(...[...shapeOf(await response.json(), `$${path.split('?')[0]}`)].sort())
    }

    const fingerprint = createHash('sha256').update(paths.join('\n')).digest('hex').slice(0, 16)

    expect(
      { format: PARTS_FORMAT, fingerprint },
      'The JSON shape of a ledger part changed. Raise PARTS_FORMAT in datasetEtag.ts, then put the new fingerprint here.',
    ).toEqual({ format: 1, fingerprint: '5b2caefa4e72dabc' })
  })
})
