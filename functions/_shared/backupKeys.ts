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
