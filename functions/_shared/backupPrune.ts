import type { BackupObjectMeta, BackupStore } from '../domain/ports/backupStore'
import type { BackupPolicy } from './backupPolicy'
import { backupUnitOf, manifestKey, utcDateFromKey } from './backupKeys'

interface Unit {
  owner: string
  dateKey: string
  size: number
  keys: string[]
  /** A single file is whole; a chunked backup counts only once its manifest is written. */
  complete: boolean
}

/** A day's snapshot file, or every object of a chunked backup's folder, as one thing to keep or drop. */
function unitsOf(objects: BackupObjectMeta[]): Unit[] {
  const units = new Map<string, Unit>()
  for (const obj of objects) {
    const found = backupUnitOf(obj.key)
    if (!found) continue
    const unit = units.get(found.unit) ?? {
      owner: found.owner,
      dateKey: found.dateKey,
      size: 0,
      keys: [],
      complete: found.unit === obj.key,
    }
    unit.size += obj.size
    unit.keys.push(obj.key)
    if (obj.key === manifestKey(found.owner, found.dateKey)) unit.complete = true
    units.set(found.unit, unit)
  }
  return [...units.values()]
}

/**
 * The newest complete backup of each current owner, whatever its age and however full the bucket is. Without it an
 * owner whose backups have been failing, or a bucket over its cap, loses the last backup there is. Only owners who
 * still have data are listed: the backups of someone who was revoked and purged age out like any other.
 */
function newestCompletePerOwner(units: Unit[], owners: ReadonlySet<string>): Set<Unit> {
  const newest = new Map<string, Unit>()
  for (const unit of units) {
    if (!owners.has(unit.owner)) continue
    const best = newest.get(unit.owner)
    if (unit.complete && (!best || unit.dateKey > best.dateKey)) newest.set(unit.owner, unit)
  }
  return new Set(newest.values())
}

export function keysOlderThan(
  objects: BackupObjectMeta[],
  retentionDays: number,
  todayKey: string,
  owners: ReadonlySet<string> = new Set(),
): string[] {
  const cutoff = utcDateFromKey(todayKey)
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays)
  const units = unitsOf(objects)
  const kept = newestCompletePerOwner(units, owners)
  return units
    .filter((unit) => !kept.has(unit) && utcDateFromKey(unit.dateKey) < cutoff)
    .flatMap((unit) => unit.keys)
}

/**
 * Delete oldest dated backups until total stored bytes is at or below maxBucketBytes, never an owner's newest complete
 * one. A chunked backup goes whole: dropping some of its parts would leave a manifest that points at nothing.
 */
export function keysOverSizeBudget(
  objects: BackupObjectMeta[],
  maxBucketBytes: number,
  owners: ReadonlySet<string> = new Set(),
): string[] {
  const units = unitsOf(objects).sort(
    (a, b) => utcDateFromKey(a.dateKey).getTime() - utcDateFromKey(b.dateKey).getTime(),
  )
  const kept = newestCompletePerOwner(units, owners)

  let total = units.reduce((sum, unit) => sum + unit.size, 0)
  const toDrop: string[] = []
  for (const unit of units) {
    if (total <= maxBucketBytes) break
    if (kept.has(unit)) continue
    toDrop.push(...unit.keys)
    total -= unit.size
  }
  return toDrop
}

export function buildPrunePlan(
  objects: BackupObjectMeta[],
  policy: BackupPolicy,
  todayKey: string,
  owners: ReadonlySet<string> = new Set(),
): string[] {
  const byAge = new Set(keysOlderThan(objects, policy.retentionDays, todayKey, owners))
  const remaining = objects.filter((obj) => !byAge.has(obj.key))
  const bySize = keysOverSizeBudget(remaining, policy.maxBucketBytes, owners)
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
