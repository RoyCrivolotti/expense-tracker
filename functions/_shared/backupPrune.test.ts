import { describe, expect, it } from 'vitest'
import { buildPrunePlan, keysOlderThan, keysOverSizeBudget } from './backupPrune'

const objs = (rows: [string, number][]) => rows.map(([key, size]) => ({ key, size }))

describe('keysOlderThan', () => {
  it('drops snapshots before the retention window', () => {
    const keys = keysOlderThan(
      objs([
        ['a@b.com/2026-06-01.json', 100],
        ['a@b.com/2026-06-12.json', 100],
        ['a@b.com/2026-06-18.json', 100],
      ]),
      7,
      '2026-06-18',
    )
    expect(keys).toEqual(['a@b.com/2026-06-01.json'])
  })
})

describe('keysOverSizeBudget', () => {
  it('deletes oldest dated snapshots first until under budget', () => {
    const keys = keysOverSizeBudget(
      objs([
        ['a@b.com/2026-06-01.json', 400],
        ['a@b.com/2026-06-02.json', 400],
        ['b@c.com/2026-06-03.json', 400],
      ]),
      500,
    )
    expect(keys).toEqual(['a@b.com/2026-06-01.json', 'a@b.com/2026-06-02.json'])
  })

  it('ignores keys without a date suffix', () => {
    expect(keysOverSizeBudget(objs([['manifest.json', 900]]), 100)).toEqual([])
  })

  it('returns empty when already under size budget', () => {
    expect(
      keysOverSizeBudget(
        objs([
          ['a@b.com/2026-06-01.json', 100],
          ['a@b.com/2026-06-02.json', 100],
        ]),
        500,
      ),
    ).toEqual([])
  })
})

describe('buildPrunePlan', () => {
  it('combines age and size pruning without duplicates', () => {
    const plan = buildPrunePlan(
      objs([
        ['a@b.com/2026-05-01.json', 300],
        ['a@b.com/2026-06-17.json', 300],
        ['a@b.com/2026-06-18.json', 300],
      ]),
      { retentionDays: 7, maxBucketBytes: 400, maxSnapshotBytes: 9999, bucketAlertThresholdFraction: 0.8 },
      '2026-06-18',
    )
    expect(plan).toEqual(['a@b.com/2026-05-01.json', 'a@b.com/2026-06-17.json'])
  })
})
