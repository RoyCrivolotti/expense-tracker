import type { BackupObjectMeta, BackupStore } from '../domain/ports/backupStore'
import type { BackupPolicy } from './backupPolicy'
import { backupUnitOf, utcDateFromKey } from './backupKeys'

export function keysOlderThan(
  objects: BackupObjectMeta[],
  retentionDays: number,
  todayKey: string,
): string[] {
  const cutoff = utcDateFromKey(todayKey)
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays)
  return objects
    .filter((obj) => {
      const dateKey = backupUnitOf(obj.key)?.dateKey ?? null
      return dateKey !== null && utcDateFromKey(dateKey) < cutoff
    })
    .map((obj) => obj.key)
}

interface Unit {
  dateKey: string
  size: number
  keys: string[]
}

/** A day's snapshot file, or every object of a chunked backup's folder, as one thing to keep or drop. */
function unitsOf(objects: BackupObjectMeta[]): Unit[] {
  const units = new Map<string, Unit>()
  for (const obj of objects) {
    const found = backupUnitOf(obj.key)
    if (!found) continue
    const unit = units.get(found.unit) ?? { dateKey: found.dateKey, size: 0, keys: [] }
    unit.size += obj.size
    unit.keys.push(obj.key)
    units.set(found.unit, unit)
  }
  return [...units.values()]
}

/**
 * Delete oldest dated backups until total stored bytes is at or below maxBucketBytes. A chunked backup
 * goes whole: dropping some of its parts would leave a manifest that points at nothing.
 */
export function keysOverSizeBudget(objects: BackupObjectMeta[], maxBucketBytes: number): string[] {
  const dated = unitsOf(objects).sort(
    (a, b) => utcDateFromKey(a.dateKey).getTime() - utcDateFromKey(b.dateKey).getTime(),
  )

  let total = dated.reduce((sum, unit) => sum + unit.size, 0)
  const toDrop: string[] = []
  for (const unit of dated) {
    if (total <= maxBucketBytes) break
    toDrop.push(...unit.keys)
    total -= unit.size
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

/**
 * Deletes the keys. One object at a time unless `batch` is true and the store can delete many in one call, which
 * only the chunked backup asks for, because pruning one of its days removes dozens of objects.
 */
export async function applyPrunePlan(store: BackupStore, keys: string[], batch = false): Promise<number> {
  if (batch && keys.length > 0 && store.deleteMany) {
    await store.deleteMany(keys)
    return keys.length
  }
  let deleted = 0
  for (const key of keys) {
    await store.delete(key)
    deleted += 1
  }
  return deleted
}
