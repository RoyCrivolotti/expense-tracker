export interface PushInstant {
  /** The moment the push is dated, in epoch milliseconds. */
  instantMs: number
  /** The calendar day on the phone, read off the string so a changed offset cannot move it. */
  localDate: string
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** The server's clock may differ from the phone's; further apart than this is not a real push. */
export const MAX_CLOCK_SKEW_MS = 2 * 24 * 60 * 60 * 1000

function offsetMinutes(zone: string): number | null {
  if (zone === 'Z') return 0
  const hours = Number(zone.slice(1, 3))
  const minutes = Number(zone.slice(4, 6))
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
  if (offset === null || hour > 23 || minute > 59 || second > 59) return null
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null
  return { instantMs: wall.getTime() - offset * 60_000, localDate: `${m[1]}-${m[2]}-${m[3]}` }
}

/** Whether a push dated at `instantMs` is believable when the server receives it at `receivedMs`. */
export function withinClockSkew(instantMs: number, receivedMs: number): boolean {
  return Math.abs(instantMs - receivedMs) <= MAX_CLOCK_SKEW_MS
}
