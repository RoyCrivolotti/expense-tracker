import { MAX_SOURCES_PER_OWNER } from '../../../src/domain/capture'
import type { CaptureCaps, DailyCaps } from '../../../src/domain/ports/captureRepository'

/** Largest request body the Worker reads. A real push is a few hundred bytes. */
export const MAX_BODY_BYTES = 16 * 1024

/** Longest text a field may hold before the push is refused as malformed. */
export const MAX_TITLE_LENGTH = 200
export const MAX_BODY_TEXT_LENGTH = 4000
export const MAX_DATE_LENGTH = 64

/** Starting values, a guess until a few weeks of real use show the rate. */
export const KEY_PER_HOUR = 20
export const KEY_PER_DAY = 100
export const OWNER_PER_DAY = 200
export const GLOBAL_PER_DAY = 2000
/** Open recommendations one person may hold. Dismissing or submitting frees room. */
export const OPEN_PER_OWNER = 2000

const HOUR_MS = 60 * 60 * 1000

export const DAILY_CAPS: DailyCaps = {
  perOwner: OWNER_PER_DAY,
  global: GLOBAL_PER_DAY,
  sourcesPerOwner: MAX_SOURCES_PER_OWNER,
}

export function captureCaps(now: Date): CaptureCaps {
  return {
    keyPerHour: KEY_PER_HOUR,
    keyPerDay: KEY_PER_DAY,
    hourSince: new Date(now.getTime() - HOUR_MS).toISOString(),
    daySince: new Date(now.getTime() - 24 * HOUR_MS).toISOString(),
    openPerOwner: OPEN_PER_OWNER,
  }
}
