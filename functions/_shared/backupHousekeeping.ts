import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { BackupStore } from '../domain/ports/backupStore'
import type { BackupPolicy } from './backupPolicy'
import { applyPrunePlan, buildPrunePlan } from './backupPrune'

/** What the single-file and the chunked backup share once the day's snapshots are written. */
export interface Housekeeping {
  store: BackupStore | null
  alerts: BackupAlerts
  policy: BackupPolicy
}

function totalBytes(objects: { size: number }[]): number {
  return objects.reduce((sum, obj) => sum + obj.size, 0)
}

export async function pruneBackups(deps: Housekeeping, dateKey: string, batch = false): Promise<number> {
  if (!deps.store) return 0
  const objects = await deps.store.list()
  const keys = buildPrunePlan(objects, deps.policy, dateKey)
  return applyPrunePlan(deps.store, keys, batch)
}

export async function maybeAlertBucketUsage(deps: Housekeeping): Promise<number> {
  if (!deps.store) return 0
  const objects = await deps.store.list()
  const usedBytes = totalBytes(objects)
  const threshold = deps.policy.maxBucketBytes * deps.policy.bucketAlertThresholdFraction
  if (usedBytes >= threshold) {
    await deps.alerts.onBucketNearLimit({
      usedBytes,
      limitBytes: deps.policy.maxBucketBytes,
    })
  }
  return usedBytes
}
