import { describe, expect, it, vi } from 'vitest'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { BackupStore } from '../domain/ports/backupStore'
import type { BackupPolicy } from './backupPolicy'
import { maybeAlertBucketUsage } from './backupHousekeeping'

const policy: BackupPolicy = {
  retentionDays: 30,
  maxBucketBytes: 1000,
  maxSnapshotBytes: 100,
  bucketAlertThresholdFraction: 0.8,
}

function setup(sizes: number[]) {
  const onBucketNearLimit = vi.fn().mockResolvedValue(undefined)
  const alerts = { onBucketNearLimit } as unknown as BackupAlerts
  const store = {
    list: () => Promise.resolve(sizes.map((size, i) => ({ key: `backup-${i}`, size }))),
  } as unknown as BackupStore
  return { deps: { store, alerts, policy }, onBucketNearLimit }
}

describe('maybeAlertBucketUsage', () => {
  it('alerts at exactly the threshold, and not a byte below it', async () => {
    const at = setup([800])
    await maybeAlertBucketUsage(at.deps)
    expect(at.onBucketNearLimit).toHaveBeenCalledWith({ usedBytes: 800, limitBytes: 1000 })

    const below = setup([799])
    await maybeAlertBucketUsage(below.deps)
    expect(below.onBucketNearLimit).not.toHaveBeenCalled()
  })

  it('adds up each object’s own size, not the number of objects', async () => {
    const { deps, onBucketNearLimit } = setup([500, 200, 100])

    expect(await maybeAlertBucketUsage(deps)).toBe(800)
    expect(onBucketNearLimit).toHaveBeenCalledWith({ usedBytes: 800, limitBytes: 1000 })
  })

  it('does not alert, and reads nothing, with no store', async () => {
    const { onBucketNearLimit } = setup([])

    expect(
      await maybeAlertBucketUsage({ store: null, alerts: { onBucketNearLimit } as unknown as BackupAlerts, policy }),
    ).toBe(0)
    expect(onBucketNearLimit).not.toHaveBeenCalled()
  })
})
