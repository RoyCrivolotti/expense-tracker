import type { BackupObjectMeta, BackupStore } from '@domain/ports/backupStore'
import type { BackupPolicy } from './backupPolicy'
import { dateKeyFromObjectKey, utcDateFromKey } from './backupKeys'

export function keysOlderThan(
  objects: BackupObjectMeta[],
  retentionDays: number,
  todayKey: string,
): string[] {
  const cutoff = utcDateFromKey(todayKey)
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays)
  return objects
    .filter((obj) => {
      const dateKey = dateKeyFromObjectKey(obj.key)
      return dateKey !== null && utcDateFromKey(dateKey) < cutoff
    })
    .map((obj) => obj.key)
}

/** Delete oldest dated snapshots until total stored bytes is at or below maxBucketBytes. */
export function keysOverSizeBudget(objects: BackupObjectMeta[], maxBucketBytes: number): string[] {
  const dated = objects
    .map((obj) => ({ obj, dateKey: dateKeyFromObjectKey(obj.key) }))
    .filter((row): row is { obj: BackupObjectMeta; dateKey: string } => row.dateKey !== null)
    .sort((a, b) => utcDateFromKey(a.dateKey).getTime() - utcDateFromKey(b.dateKey).getTime())

  let total = dated.reduce((sum, row) => sum + row.obj.size, 0)
  const toDrop: string[] = []
  for (const row of dated) {
    if (total <= maxBucketBytes) break
    toDrop.push(row.obj.key)
    total -= row.obj.size
  }
  return toDrop
}

export function buildPrunePlan(
  objects: BackupObjectMeta[],
  policy: BackupPolicy,
  todayKey: string,
): string[] {
  const byAge = new Set(keysOlderThan(objects, policy.retentionDays, todayKey))
  const remaining = objects.filter((obj) => !byAge.has(obj.key))
  const bySize = keysOverSizeBudget(remaining, policy.maxBucketBytes)
  return [...byAge, ...bySize]
}

export async function applyPrunePlan(store: BackupStore, keys: string[]): Promise<number> {
  let deleted = 0
  for (const key of keys) {
    await store.delete(key)
    deleted += 1
  }
  return deleted
}
