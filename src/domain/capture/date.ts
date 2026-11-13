export interface PushInstant {
  /** The moment the push is dated, in epoch milliseconds. */
  instantMs: number
  /** The calendar day on the phone, read off the string so a changed offset cannot move it. */
  localDate: string
  /** The phone's offset from UTC at that moment, in minutes. */
  offsetMinutes: number
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/

/** The server's clock may differ from the phone's; further apart than this is not a real push. */
export const MAX_CLOCK_SKEW_MS = 2 * 24 * 60 * 60 * 1000

function offsetMinutes(zone: string): number | null {
  if (zone === 'Z') return 0
  const hours = Number(zone.slice(1, 3))
  const minutes = Number(zone.slice(-2))
  if (hours > 14 || minutes > 59) return null
  return (zone.startsWith('-') ? -1 : 1) * (hours * 60 + minutes)
}

/** Parses the phone's Date. The offset is read from the string because daylight saving changes it. */
export function parsePushDate(date: string): PushInstant | null {
  const m = date.trim().match(ISO)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number, number, number, number, number, number,
  ]
  const offset = offsetMinutes(m[7] ?? '')
  if (year < 100 || offset === null || hour > 23 || minute > 59 || second > 59) return null
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null
  return { instantMs: wall.getTime() - offset * 60_000, localDate: `${m[1]}-${m[2]}-${m[3]}`, offsetMinutes: offset }
}

/**
 * The moment as the phone wrote it: wall-clock time with the phone's offset, never `Z`. The same instant as
 * `new Date(instantMs).toISOString()`, but a reader can tell the phone's own time of day from it without a time
 * zone database, and a `Z` still means "offset unknown".
 */
export function isoWithOffset(instantMs: number, offsetMinutes: number): string {
  const wall = new Date(instantMs + offsetMinutes * 60_000).toISOString().slice(0, 19)
  const abs = Math.abs(offsetMinutes)
  const zone = `${offsetMinutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return `${wall}${zone}`
}

/** Whether a push dated at `instantMs` is believable when the server receives it at `receivedMs`. */
export function withinClockSkew(instantMs: number, receivedMs: number): boolean {
  return Math.abs(instantMs - receivedMs) <= MAX_CLOCK_SKEW_MS
}
