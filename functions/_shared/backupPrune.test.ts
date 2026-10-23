import { describe, expect, it, vi } from 'vitest'
import { applyPrunePlan, buildPrunePlan, keysOlderThan, keysOverSizeBudget } from './backupPrune'

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

describe('a chunked backup in the bucket', () => {
  const folder = (owner: string, day: string, sizes: number[]) => [
    ...sizes.map((size, i): [string, number] => [`${owner}/${day}/part-00000${i + 1}.ndjson`, size]),
    [`${owner}/${day}/manifest.json`, 50] as [string, number],
  ]

  it('is dropped with every object it holds once it is older than the retention window', () => {
    const keys = keysOlderThan(
      objs([...folder('a@b.com', '2026-06-01', [100, 100]), ...folder('a@b.com', '2026-06-18', [100]), ['a@b.com/2026-06-02.json', 10]]),
      7,
      '2026-06-18',
    )
    expect(keys.sort()).toEqual([
      'a@b.com/2026-06-01/manifest.json',
      'a@b.com/2026-06-01/part-000001.ndjson',
      'a@b.com/2026-06-01/part-000002.ndjson',
      'a@b.com/2026-06-02.json',
    ])
  })

  it('goes whole when the bucket is over budget, never a part at a time', () => {
    const keys = keysOverSizeBudget(
      objs([...folder('a@b.com', '2026-06-01', [400, 400]), ...folder('a@b.com', '2026-06-02', [300]), ['b@c.com/2026-06-03.json', 300]]),
      700,
    )
    expect(keys.sort()).toEqual([
      'a@b.com/2026-06-01/manifest.json',
      'a@b.com/2026-06-01/part-000001.ndjson',
      'a@b.com/2026-06-01/part-000002.ndjson',
    ])
  })

  it('counts a folder and a single file of the same day as two backups', () => {
    const keys = keysOverSizeBudget(objs([...folder('a@b.com', '2026-06-01', [500]), ['b@c.com/2026-06-01.json', 500]]), 600)
    expect(keys).toHaveLength(2)
  })

  it('is deleted one object at a time unless a batch is asked for and the store can do it', async () => {
    const deleteMany = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const base = { put: vi.fn(), get: vi.fn(), list: vi.fn() }

    expect(await applyPrunePlan({ ...base, delete: remove, deleteMany }, ['a', 'b'])).toBe(2)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(deleteMany).not.toHaveBeenCalled()

    expect(await applyPrunePlan({ ...base, delete: remove, deleteMany }, ['a', 'b', 'c'], true)).toBe(3)
    expect(deleteMany).toHaveBeenCalledWith(['a', 'b', 'c'])
    expect(remove).toHaveBeenCalledTimes(2)

    expect(await applyPrunePlan({ ...base, delete: remove }, ['a', 'b'], true)).toBe(2)
    expect(remove).toHaveBeenCalledTimes(4)
    expect(await applyPrunePlan({ ...base, delete: remove, deleteMany }, [], true)).toBe(0)
    expect(deleteMany).toHaveBeenCalledOnce()
  })
})

describe('the newest complete backup of an owner who still has data', () => {
  const policy = { retentionDays: 7, maxBucketBytes: 100, maxSnapshotBytes: 9999, bucketAlertThresholdFraction: 0.8 }
  const roomy = { ...policy, maxBucketBytes: 10_000 }
  const current = new Set(['a@b.com', 'b@c.com'])
  const folder = (owner: string, day: string, withManifest = true): [string, number][] => [
    [`${owner}/${day}/part-000001.ndjson`, 200],
    ...(withManifest ? [[`${owner}/${day}/manifest.json`, 50] as [string, number]] : []),
  ]

  it('is kept when it is older than the retention window, because it is the only one there is', () => {
    const all = objs([['a@b.com/2026-05-01.json', 300]])

    expect(keysOlderThan(all, 7, '2026-06-18', current)).toEqual([])
    expect(keysOlderThan(all, 7, '2026-06-18')).toEqual(['a@b.com/2026-05-01.json'])
  })

  it('is kept when the bucket is over its cap, and the older ones go instead', () => {
    const all = objs([
      ['a@b.com/2026-06-16.json', 300],
      ['a@b.com/2026-06-17.json', 300],
    ])

    expect(keysOverSizeBudget(all, 100, current)).toEqual(['a@b.com/2026-06-16.json'])
  })

  it('is one per owner, not one overall', () => {
    const all = objs([
      ['a@b.com/2026-05-01.json', 300],
      ['b@c.com/2026-05-02.json', 300],
    ])

    expect(keysOlderThan(all, 7, '2026-06-18', current)).toEqual([])
    expect(keysOverSizeBudget(all, 100, current)).toEqual([])
  })

  it('is the older complete one while the newest folder has no manifest yet', () => {
    const all = objs([...folder('a@b.com', '2026-05-01'), ...folder('a@b.com', '2026-06-18', false)])

    expect(buildPrunePlan(all, roomy, '2026-06-18', current)).toEqual([])
    expect(buildPrunePlan(all, roomy, '2026-06-18')).toEqual(['a@b.com/2026-05-01/part-000001.ndjson', 'a@b.com/2026-05-01/manifest.json'])
  })

  it('does not hold on to the backups of someone who no longer has data', () => {
    const all = objs([['gone@x.com/2026-05-01.json', 300]])

    expect(buildPrunePlan(all, policy, '2026-06-18', current)).toEqual(['gone@x.com/2026-05-01.json'])
  })

  it('leaves the plan alone when every owner has a recent backup', () => {
    const all = objs([
      ['a@b.com/2026-05-01.json', 300],
      ['a@b.com/2026-06-17.json', 300],
      ['a@b.com/2026-06-18.json', 300],
    ])

    expect(buildPrunePlan(all, roomy, '2026-06-18', current)).toEqual(buildPrunePlan(all, roomy, '2026-06-18'))
  })

  it('may leave the bucket over its cap rather than drop the last backup of anyone', () => {
    const all = objs([['a@b.com/2026-06-18.json', 300]])

    expect(buildPrunePlan(all, policy, '2026-06-18', current)).toEqual([])
  })
})
