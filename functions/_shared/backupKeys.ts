const DATE_KEY = /^(\d{4}-\d{2}-\d{2})\.json$/

/** Parse YYYY-MM-DD from an R2 object key (owner/YYYY-MM-DD.json). */
export function dateKeyFromObjectKey(key: string): string | null {
  const name = key.split('/').pop() ?? ''
  return DATE_KEY.test(name) ? name.replace('.json', '') : null
}

export function utcDateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

export function ownerBackupKey(owner: string, dateKey: string): string {
  return `${owner}/${dateKey}.json`
}

/** Everything a chunked backup of one owner on one day is stored under. */
export function backupFolder(owner: string, dateKey: string): string {
  return `${owner}/${dateKey}/`
}

export const manifestKey = (owner: string, dateKey: string): string => `${backupFolder(owner, dateKey)}manifest.json`
export const stateKey = (owner: string, dateKey: string): string => `${backupFolder(owner, dateKey)}state.json`
export const partKey = (owner: string, dateKey: string, sequence: number): string =>
  `${backupFolder(owner, dateKey)}part-${String(sequence).padStart(6, '0')}.ndjson`

const FOLDER_OBJECT = /^(.+)\/(\d{4}-\d{2}-\d{2})\/[^/]+$/

/**
 * The backup an object belongs to: a day's snapshot is one file, a chunked backup is a folder of them, and
 * either is kept or dropped as a whole. Null for anything else in the bucket.
 */
export function backupUnitOf(key: string): { unit: string; owner: string; dateKey: string } | null {
  const folder = FOLDER_OBJECT.exec(key)
  if (folder) return { unit: `${folder[1]}/${folder[2]}/`, owner: folder[1] as string, dateKey: folder[2] as string }
  const dateKey = dateKeyFromObjectKey(key)
  return dateKey === null ? null : { unit: key, owner: key.slice(0, Math.max(key.lastIndexOf('/'), 0)), dateKey }
}
